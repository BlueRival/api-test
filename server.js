"use strict";

process.env.NODE_PATH = '.';

if ( process.env.NODE_ENV === undefined ) {
  process.env.NODE_ENV = 'development';
}

const daemonix = require( 'daemonix' );
const Container = require( 'sidi' ).Container;

// make sure daemonix logs to standard error
const container = new Container();
container.set( 'scribe', function ( level, message, meta ) {

  if ( arguments.length === 3 ) {
    message += ': ' + JSON.stringify( meta );
  }

  console.error( new Date().toISOString() + ' - ' + level + ': [' + process.pid + '] ' + message );

} );

container.set( 'app', require( './app' ) );
container.set( 'workers', {
  count: 1,
  restartTimeout: 3000
} );

daemonix( container );

