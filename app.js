"use strict";

const packageFile = require( './package.json' );
const async = require( 'async' );
const Container = require( 'sidi' ).Container;
const Winston = require( 'winston' );

const App = function ( deps ) {

  let env = deps.get( 'env' );

  this._container = new Container();
  this._container.set( 'env', env );
  this._container.set( 'package', packageFile );
  this._package = packageFile;
  this._container.set( 'package', this._package );

  let config = require( './config' )( env );

  if ( config === null ) {
    throw new Error( 'failed to load config' );
  }
  this._container.set( 'config', config );

  let logConfig = config.get( 'log' );
  let winstonTransports = [
    new (Winston.transports.Console)( {
      timestamp: true,
      colorize: true,
      level: logConfig.level
    } )
  ];

  if ( logConfig.logstash ) {
    logConfig.logstash.level = logConfig.level;
    winstonTransports.push( new (Winston.transports.Logstash)( logConfig.logstash ) );
  }

  let winston = new (Winston.Logger)( {
    transports: winstonTransports
  } );

  let scribe = this._scribe = function ( level, message, meta ) {

    if ( level === 'warning' ) {
      console.error( '"warning" is not a valid log level, please use "warn"' );
      console.trace();
      level = 'warn';
    }

    if ( message instanceof Error ) {
      message = message.message + ': ' + message.stack;
    }

    if ( meta ) {
      if ( typeof meta !== 'string' ) {
        meta = JSON.stringify( meta );
      }
      let maxSize = 10000;
      if ( meta.length > maxSize ) {
        meta = meta.slice( 0, maxSize - 3 ).trim() + '...';
      }
      winston.log( level, '[' + process.pid + '] ' + message + ': ' + meta );
    } else {
      winston.log( level, '[' + process.pid + '] ' + message );
    }
  };

  scribe( 'info', 'instantiating app for env', env );

  this._container.set( 'scribe', scribe );

  this._components = {
    webServer: require( 'lib/webServer' ),
    test: require( 'lib/test' )
  };

  this._depsOrder = [];

  for ( let name in this._components ) {
    if ( this._components.hasOwnProperty( name ) ) {
      try {
        this._components[ name ] = new this._components[ name ]( this._container );
        this._depsOrder.push( name );
        this._container.set( name, this._components[ name ] );
        scribe( 'info', 'instantiated component: ' + name );
      } catch ( e ) {
        scribe( 'error', 'exception instantiating component: ' + name + ': ' + e.toString() + ': ' + e.stack );
        throw e;
      }
    }
  }

  scribe( 'info', 'finished instantiating' );

};

App.prototype.init = function ( done ) {

  let tasks = [];
  let scribe = this._container.get( 'scribe' );

  scribe( 'info', 'initializing app' );

  let pushTask = function ( name, component ) {
    tasks.push( function ( done ) {
      scribe( 'debug', 'initializing component', name );
      try {
        component.init( function ( e ) {
          if ( e ) {
            scribe( 'error', 'error initializing component: ' + name, e.message + ' (' + (e.code || 500) + ')' );
          } else {
            scribe( 'info', 'initialized component', name );
          }
          done( e );
        } );
      } catch ( e ) {
        done( e );
      }
    } );
  };

  for ( let i = 0; i < this._depsOrder.length; i++ ) {
    pushTask( this._depsOrder[ i ], this._components[ this._depsOrder[ i ] ] );
  }

  async.series( tasks, ( err ) => {

    // err = new Error( 'test error' );

    if ( err ) {
      scribe( 'err', 'startup error', err );
      done( err );
    } else {
      scribe( 'info', 'finished initializing' );
      done( null );
    }
  } );

};

App.prototype.dinit = function ( done ) {

  let tasks = [];
  let scribe = this._container.get( 'scribe' );

  scribe( 'info', 'de-initializing app' );

  let pushTask = function ( name, component ) {

    tasks.push( function ( done ) {
      scribe( 'debug', 'de-initializing component', name );

      try {
        component.dinit( function ( e ) {
          if ( e ) {
            scribe( 'error', 'error de-initializing component: ' + name, e );
          } else {
            scribe( 'info', 'de-initialized component', name );
          }
          done( e );
        } );
      } catch ( e ) {
        done( e );
      }
    } );
  };

  for ( let i = (this._depsOrder.length - 1); i > -1; i-- ) {
    pushTask( this._depsOrder[ i ], this._components[ this._depsOrder[ i ] ] );
  }

  async.series( tasks, ( err ) => {
    if ( err ) {
      scribe( 'err', 'shutdown error', err );
      done( err );
    } else {
      scribe( 'info', 'finished de-initializing' );
      done( null );
    }
  } );

};

module.exports = App;

