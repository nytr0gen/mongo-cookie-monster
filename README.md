# Mongo Cookie Monster

Mongo Cookie Monster is a cookie store backed by MongoDb for tough-cookie module


## Installation

    $ npm install mongo-cookie-monster

## Options

- `connection` - connection string for mongo
- `collection` - collection of mongo
- `queryColumn` - column of mongo

## Usage
```javascript
  var request = require('request');
  var mongoConnection = {
      connection: 'username:password@mongo-domain/mongo-database',
      collection: 'mongo-collection',
      queryColumn: 'email'
  };
  var CookieMonster = require('mongo-cookie-monster')(mongoConnection);
  var j = new CookieMonster('nytr0gen.george@gmail.com');

  request = request.defaults({ jar : request.jar(j) });
  request('https://0x4139.com', function(err, response, body) {
    console.log(response.headers['set-cookie']);
  });
```
## License

 MIT
