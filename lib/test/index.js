'use strict';

const Test = function ( deps ) {

  let packageFile = deps.get( 'package' );
  let version = packageFile.version;

  let webCore = deps.get( 'webServer' ).getCore();

  webCore.get( '/status', ( req, res ) => {
    res.send( version );
  } );

  // catch-all is reflection of request
  webCore.use( ( req, res ) => {

    let response = {};

    response.method = req.method;
    response.url = req.url;
    response.headers = req.headers;
    response.httpVersionMajor = req.httpVersionMajor;
    response.httpVersionMinor = req.httpVersionMinor;
    response.httpVersion = req.httpVersion;
    response.body = req.body;
    response.query = req.query;
    response.cookies = req.cookies;
    response.remoteAddress = req.connection.remoteAddress;
    response.remotePort = req.connection.remotePort;

    res.json( response );

  } );

};

Test.prototype.init = function ( done ) {
  done( null );
};

Test.prototype.dinit = function ( done ) {
  done( null );
};

module.exports = Test;
