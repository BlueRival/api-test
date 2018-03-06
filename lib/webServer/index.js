'use strict';

let __ = require( 'doublescore' );
let async = require( 'async' );
let bodyParser = require( 'body-parser' );
let compression = require( 'compression' );
let cookieParser = require( 'cookie-parser' );
let express = require( 'express' );
let fs = require( 'fs' );
let http = require( 'http' );
let https = require( 'https' );

/**
 * Development SSL certificate should not be used in production. Your
 * configs should override this.
 *
 * @type {{key: (String), cert: (String)}}
 */
let devSSl = {
  key: (fs.existsSync( __dirname + '/defaultSSL/server.key' ) ? fs.readFileSync( __dirname + '/defaultSSL/server.key',
    'utf8' ) : null),
  cert: (fs.existsSync( __dirname + '/defaultSSL/server.crt' ) ? fs.readFileSync( __dirname + '/defaultSSL/server.crt',
    'utf8' ) : null)
};

let defaultConfig = {
  cors: [],
  host: 'localdev',
  http: {
    enabled: true,
    port: 8080
  },
  https: {
    enabled: false,
    port: 8443,
    options: devSSl
  },
  basicAuth: {
    username: null,
    password: null
  }
};

let WebServer = function ( deps ) {

  let self = this;

  self._outstandingRequests = 0;

  self._config = __( defaultConfig ).mixin( deps.get( 'config' ).get( 'webServer' ) );

  self._scribe = deps.get( 'scribe' );
  self._initialized = false;

  self._core = express();
  self._core.express = express;

  self._core.use( compression( {
    filter: ( req, res ) => {
      if ( req.headers[ 'x-no-compression' ] ) {
        // don't compress responses with this request header
        return false;
      }

      // fallback to standard filter function
      return compression.filter( req, res );
    }
  } ) );

  self._core.use( cookieParser() );

  self._core.set( 'trust proxy', 1 );

  self._core.use( ( req, res, next ) => {

    let entry = {
      protocol: req.protocol.toUpperCase(),
      hostname: req.hostname,
      path: req.path,
      method: req.method.toUpperCase(),
      ip: req.ip,
      ips: req.ips,
      cookies: null,
      query: null,
      body: null
    };

    res.once( 'finish', () => {

      entry.headers = req.headers;
      entry.cookies = req.cookies;
      entry.query = req.query;
      entry.body = req.body;

      self._scribe( 'info',
        `${entry.protocol} ${entry.method}: ${entry.hostname}: ${entry.path}:  ${JSON.stringify( entry.ips )}`,
        entry );

    } );

    next();

  } );

  self._core.use( self._countRequests() );

  self._core.use( bodyParser.json( { limit: '20mb' } ) );

  // handle CORS request
  self._core.use( function ( req, res, next ) {

    // detect CORs
    if ( req.headers.origin ) {

      // strip protocol and port
      let requestHost = req.headers.origin.toLowerCase().replace( /^https?:\/\//, '' ).replace( /:[0-9]*/, '' );

      // check if origin host is approved
      if ( self._config.cors.indexOf( requestHost ) > -1 ) {

        // approved host, set approval on response headers
        res.setHeader( 'Access-Control-Allow-Origin', req.headers.origin );
        res.setHeader( 'Access-Control-Allow-Credentials', 'true' );

        if ( req.method.toUpperCase() === 'OPTIONS' ) {

          // if its an options request, set additional specifications
          res.setHeader( 'Access-Control-Allow-Methods', 'POST' );
          res.setHeader( 'Access-Control-Allow-Headers', 'Cookie,X-Requested-With,Content-Type,Content-Length,Accept' );
          res.setHeader( 'Access-Control-Max-Age', '600' );
          res.setHeader( 'Content-Type', 'text/html; charset=utf-8' );
          res.writeHead( 200 );
          res.end();

        } else {

          // normal CORs call with approved host, let the call through
          next();

        }

      } else {

        // the origin is not approved
        res.writeHead( 400 );
        res.end();

      }

    } else if ( req.method.toUpperCase() === 'OPTIONS' ) {

      // options without an origin are not supported
      res.writeHead( 400 );
      res.end();

    } else {

      // non-cors request
      next();

    }

  } );

  if ( self._config.basicAuth.username && self._config.basicAuth.password ) {

    let basicAuth = express.basicAuth( function ( username, password ) {
      return (username === self._config.basicAuth.username && password === self._config.basicAuth.password);
    } );

    self._core.use( function ( req, res, next ) {

      if ( req.path.match( /^\/app/ ) || req.path === '/' ) {
        basicAuth( req, res, next );
      } else {
        next();
      }

    } );
  }

};

WebServer.prototype._countRequests = function () {
  let self = this;
  return function ( req, res, next ) {
    self._outstandingRequests++;
    res.once( 'finish', function () {
      self._outstandingRequests--;
    } );
    next();
  };
};

WebServer.prototype.getCore = function () {
  return this._core;
};

WebServer.prototype.getHostname = function () {
  throw new Error( 'getHostname() removed' );
};

WebServer.prototype.init = function ( done ) {

  if ( this._initialized ) {
    return this;
  }
  this._initialized = true;

  let config = this._config;
  let serversTasks = [];

  if ( config.http.enabled ) {

    serversTasks.push( ( done ) => {
      this._http = http.createServer( this._core ).listen( config.http.port, () => {
        done();
      } );
    } );

  }

  if ( config.https.enabled ) {

    serversTasks.push( ( done ) => {
      this._https = https.createServer( config.https.options, this._core ).listen( config.https.port, () => {
        done();
      } );
    } );

  }

  if ( serversTasks.length > 0 ) {

    async.parallel( serversTasks, ( err ) => {

      if ( err ) {
        this._scribe( 'error', 'WebServer: failed to initialize', err );
        done( err );
      } else {
        done();
      }

    } );
  } else {
    done();
  }

  return this;

};

WebServer.prototype.dinit = function ( done ) {

  if ( !this._initialized ) {
    return this;
  }
  this._initialized = false;

  let self = this;

  let config = this._config;

  let serversTasks = [];

  if ( config.http.enabled ) {
    serversTasks.push( function ( done ) {
      self._http.close();
      self._http = null;
      done( null );
    } );
  }

  if ( config.https.enabled ) {
    serversTasks.push( function ( done ) {
      self._https.close();
      self._https = null;
      done( null );
    } );
  }

  if ( serversTasks.length > 0 ) {
    async.parallel( serversTasks, function ( err ) {
      if ( err ) {
        self._scribe( 'error', 'WebServer: failed to de-initialize', err );
        done( err );
      } else {
        done();
      }
    } );
  } else {
    done();
  }

  return this;

};

module.exports = WebServer;
