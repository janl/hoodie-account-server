module.exports = sessionRoutes
module.exports.attributes = {
  name: 'account-routes-session'
}

var Boom = require('boom')

var errors = require('./utils/errors')
var joiFailAction = require('./utils/joi-fail-action')
var serialiseSession = require('./utils/serialise-session')
var toBearerToken = require('./utils/request-to-bearer-token')
var validations = require('./utils/validations')

function sessionRoutes (server, options, next) {
  var admins = options.admins
  var sessions = server.plugins.account.api.sessions
  var serialise = serialiseSession.bind(null, {
    baseUrl: server.info.uri
  })

  var createSessionRoute = {
    method: 'PUT',
    path: '/session',
    config: {
      pre: options.pre,
      auth: false,
      validate: {
        headers: validations.bearerTokenHeaderForbidden,
        query: validations.sessionQuery,
        payload: validations.sessionPayload,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var username = request.payload.data.attributes.username
      var password = request.payload.data.attributes.password
      console.log(username)
      console.log(password)
      var query = request.query

      // check for admin. If not found, check for user
      admins.validatePassword(username, password)

      .then(function () {
        if (query.include) {
          throw errors.FORBIDDEN_ADMIN_ACCOUNT
        }

        return admins.calculateSessionId(username)
      })

      .then(function (sessionId) {
        return {
          id: sessionId
        }
      })

      .catch(function (error) {
        console.log('validate error')
        console.log(error)
        if (error.name === 'not_found') {
          return sessions.add({
            username: username,
            password: password,
            include: query.include
          }, options, request)
          .catch(function (error) {
            if (error.status === 404) {
              throw errors.INVALID_CREDENTIALS
            }
            throw error
          })
        }

        throw error
      })

      .then(serialise)

      .then(function (json) {
        reply(json).code(201)
      })

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  var getSessionRoute = {
    method: 'GET',
    path: '/session',
    config: {
      auth: false,
      validate: {
        headers: validations.bearerTokenHeader,
        query: validations.sessionQuery,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var query = request.query
      var sessionId = toBearerToken(request)

      // check for admin. If not found, check for user
      admins.validateSession(sessionId)

      .then(function (doc) {
        if (query.include) {
          throw errors.FORBIDDEN_ADMIN_ACCOUNT
        }

        return {
          id: sessionId
        }
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.find(sessionId, {
            include: request.query.include
          })
          .catch(function (error) {
            if (error.status === 401 || error.status === 404) {
              throw errors.INVALID_SESSION
            }
            throw error
          })
        }

        throw error
      })

      .then(serialise)

      .then(reply)

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  var deleteSessionRoute = {
    method: 'DELETE',
    path: '/session',
    config: {
      auth: false,
      validate: {
        headers: validations.bearerTokenHeader,
        query: validations.sessionQuery,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var query = request.query
      var sessionId = toBearerToken(request)

      // check for admin. If not found, check for user
      admins.validateSession(sessionId)

      .then(function (doc) {
        if (query.include) {
          throw errors.FORBIDDEN_ADMIN_ACCOUNT
        }
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.remove(sessionId, {
            include: request.query.include
          })
          .catch(function (error) {
            if (error.status === 404 || error.status === 401) {
              throw errors.INVALID_SESSION
            }
            throw error
          })
        }

        throw error
      })

      .then(function (session) {
        if (!session) {
          return reply().code(204)
        }
        reply(serialise(session)).code(200)
      })

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  server.route([
    getSessionRoute,
    createSessionRoute,
    deleteSessionRoute
  ])

  next()
}
