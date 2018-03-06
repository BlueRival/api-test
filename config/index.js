"use strict";

const __ = require( 'doublescore' );
const fs = require( 'fs' );
const nconf = require( 'nconf' );

module.exports = function( env ) {

	const NODE_ENV = env || 'development';

	try {

		let configFilename = __dirname + '/env/' + NODE_ENV + '.json';
		let defaultsFilename = __dirname + '/default.json';

		let config = JSON.parse( fs.readFileSync( configFilename ) );
		let defaults = JSON.parse( fs.readFileSync( defaultsFilename ) );

		nconf.overrides( __( defaults ).mixin( config ) );

	} catch ( e ) {
		return null;
	}

	return nconf;

};
