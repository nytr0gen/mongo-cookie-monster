var tough = require('tough-cookie');
var mongojs = require('mongojs');
var deasync = require('deasync');
var util = require('util');

var Store = tough.Store;
var permuteDomain = tough.permuteDomain;
var permutePath = tough.permutePath;

var CookieMonster = function(opts, id) {
    Store.call(this);
    this.id = id;
    this.repository = opts.repo;
    this.queryColumn = opts.queryColumn;

    this.idx = {}; // idx is memory cache
    this.initialized = false;
    this._loadFromRepository(this.id, function(dataJson) {
        if (dataJson) this.idx = dataJson;
        this.initialized = true;
    }.bind(this));
    while (!this.initialized) {
        deasync.sleep(50);
    }
}

module.exports = function(opts) {
    if (!opts || typeof(opts) != 'object' ||
        !('connection' in opts) ||
        !('collection' in opts) ||
        !('queryColumn' in opts)
    ) {
        throw new Error('Please pass the credentials for mongo');
    }

    var repo = mongojs(opts.connection).collection(opts.collection);
    return CookieMonster.bind(this, {
        repo: repo,
        queryColumn: opts.queryColumn
    });
}

util.inherits(CookieMonster, Store);
CookieMonster.prototype.idx = null;
CookieMonster.prototype.synchronous = true;
// force a default depth:
CookieMonster.prototype.inspect = function() {
    return "{ idx: " + util.inspect(this.idx, false, 2) + ' }';
};
CookieMonster.prototype.findCookie = function(domain, path, key, cb) {
    if (!this.idx[domain]) {
        return cb(null, undefined);
    }
    if (!this.idx[domain][path]) {
        return cb(null, undefined);
    }
    return cb(null, this.idx[domain][path][key] || null);
};
CookieMonster.prototype.findCookies = function(domain, path, cb) {
    var results = [];
    if (!domain) {
        return cb(null, []);
    }
    var pathMatcher;
    if (!path) {
        // null or '/' means "all paths"
        pathMatcher = function matchAll(domainIndex) {
            for (var curPath in domainIndex) {
                var pathIndex = domainIndex[curPath];
                for (var key in pathIndex) {
                    results.push(pathIndex[key]);
                }
            }
        };
    } else if (path === '/') {
        pathMatcher = function matchSlash(domainIndex) {
            var pathIndex = domainIndex['/'];
            if (!pathIndex) {
                return;
            }
            for (var key in pathIndex) {
                results.push(pathIndex[key]);
            }
        };
    } else {
        var paths = permutePath(path) || [path];
        pathMatcher = function matchRFC(domainIndex) {
            paths.forEach(function(curPath) {
                var pathIndex = domainIndex[curPath];
                if (!pathIndex) {
                    return;
                }
                for (var key in pathIndex) {
                    results.push(pathIndex[key]);
                }
            });
        };
    }
    var domains = permuteDomain(domain) || [domain];
    var idx = this.idx;
    domains.forEach(function(curDomain) {
        var domainIndex = idx[curDomain];
        if (!domainIndex) {
            return;
        }
        pathMatcher(domainIndex);
    });
    cb(null, results);
};
CookieMonster.prototype.putCookie = function(cookie, cb) {
    if (!this.idx[cookie.domain]) {
        this.idx[cookie.domain] = {};
    }
    if (!this.idx[cookie.domain][cookie.path]) {
        this.idx[cookie.domain][cookie.path] = {};
    }
    this.idx[cookie.domain][cookie.path][cookie.key] = cookie;
    this._saveToRepository(this.id, this.idx, function() {
        cb(null);
    });
};
CookieMonster.prototype.updateCookie = function updateCookie(oldCookie, newCookie, cb) {
    // updateCookie() may avoid updating cookies that are identical.  For example,
    // lastAccessed may not be important to some stores and an equality
    // comparison could exclude that field.
    this.putCookie(newCookie, cb);
};
CookieMonster.prototype.removeCookie = function removeCookie(domain, path, key, cb) {
    if (this.idx[domain] && this.idx[domain][path] && this.idx[domain][path][key]) {
        delete this.idx[domain][path][key];
    }
    this._saveToRepository(this.id, this.idx, function() {
        cb(null);
    });
};
CookieMonster.prototype.removeCookies = function removeCookies(domain, path, cb) {
    if (this.idx[domain]) {
        if (path) {
            delete this.idx[domain][path];
        } else {
            delete this.idx[domain];
        }
    }
    this._saveToRepository(this.id, this.idx, function() {
        return cb(null);
    });
};
CookieMonster.prototype._saveToRepository = function(id, data, cb) {
    var query = {};
    query[this.queryColumn] = id;
    var dataJson = JSON.stringify(data);
    this.repository.update(query, {
        '$set': { cookie: dataJson }
    }, {
        upsert: true
    });
    cb();
};
CookieMonster.prototype._loadFromRepository = function(id, cb) {
    var query = {};
    query[this.queryColumn] = id;
    this.repository.findOne(query, {
        cookie: 1,
        _id: 0
    }, function(err, docs) {
        if (err) throw (err);
        var dataJson = docs ? JSON.parse(docs.cookie) : null;
        for (var domainName in dataJson) {
            for (var pathName in dataJson[domainName]) {
                for (var cookieName in dataJson[domainName][pathName]) {
                    dataJson[domainName][pathName][cookieName] = tough.fromJSON(JSON.stringify(dataJson[domainName][pathName][cookieName]));
                }
            }
        }
        cb(dataJson);
    });
};
