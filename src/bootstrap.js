/**
 * Init app
 */

global.Promise = require('bluebird')

const Joi = require('joi')

Joi.optionalId = () => Joi.string()
Joi.id = () => Joi.optionalId().required()
