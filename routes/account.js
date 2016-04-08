module.exports = accountRoutes
module.exports.attributes = {
  name: 'account-routes-account'
}

var Boom = require('boom')

var errors = require('./utils/errors')
var joiFailAction = require('./utils/joi-fail-action')
var serialiseAccount = require('./utils/serialise-account')
var toBearerToken = require('./utils/request-to-bearer-token')
var validations = require('./utils/validations')

function accountRoutes (server, options, next) {
  var serialise = serialiseAccount.bind(null, {
    baseUrl: server.info.uri
  })
  var admins = options.admins
  var sessions = server.plugins.account.api.sessions
  var accounts = server.plugins.account.api.accounts

  var signUpRoute = {
    method: 'PUT',
    path: '/session/account',
    config: {
      pre: options.pre,
      auth: false,
      validate: {
        headers: validations.bearerTokenHeaderForbidden,
        query: validations.accountQuery,
        payload: validations.accountPayload,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var username = request.payload.data.attributes.username
      var password = request.payload.data.attributes.password
      var id = request.payload.data.id
      var query = request.query
      accounts.add({
        username: username,
        password: password,
        include: query.include,
        id: id
      }, options, request)

      .then(serialise)

      .then(function (json) {
        reply(json).code(201)
      })

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status || 400, error.message))
      })
    }
  }

  var getAccountRoute = {
    method: 'GET',
    path: '/session/account',
    config: {
      auth: false,
      validate: {
        headers: validations.bearerTokenHeader,
        query: validations.accountQuery,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var sessionId = toBearerToken(request)

      // check for admin. If not found, check for user
      admins.validateSession(sessionId)

      .then(function (doc) {
        throw errors.NO_ADMIN_ACCOUNT
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.find(sessionId, {
            include: request.query.include === 'profile' ? 'account.profile' : undefined
          }).catch(function (error) {
            if (error.status === 404) {
              throw errors.INVALID_SESSION
            }
          })
        }

        throw error
      })

      .then(function (session) {
        return session.account
      })

      .then(serialise)

      .then(reply)

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  var patchAccountRoute = {
    method: 'PATCH',
    path: '/session/account',
    config: {
      auth: false,
      validate: {
        headers: validations.bearerTokenHeader,
        payload: validations.accountPayload,
        query: validations.accountQuery,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var sessionId = toBearerToken(request)

      var newUsername = request.payload.data.attributes.username
      var newPassword = request.payload.data.attributes.password
      var id = request.payload.data.id

      admins.validateSession(sessionId)
      .then(function (doc) {
        throw errors.FORBIDDEN_ADMIN_ACCOUNT
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.find(sessionId)
            .catch(function (error) {
              if (error.status === 404) {
                throw errors.INVALID_SESSION
              }
            })
        }
        throw error
      })

      .then(function (session) {
        if (session.account.id !== id) {
          throw errors.accountIdConflict(session.account.id)
        }
        return accounts.update(session.account, {
          username: newUsername,
          password: newPassword
        }, {
          include: request.query.include
        })
      })

      .then(function () {
        reply().code(204)
      })

      .catch(function (error) {
        error = errors.parse(error)

        reply(Boom.create(error.status, error.message))
      })
    }
  }

  var destroyAccountRoute = {
    method: 'DELETE',
    path: '/session/account',
    config: {
      auth: false,
      validate: {
        query: validations.accountQuery,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var sessionId = toBearerToken(request)

      // check for admin. If not found, check for user
      admins.validateSession(sessionId)

      .then(function (doc) {
        throw errors.FORBIDDEN_ADMIN_ACCOUNT
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.find(sessionId, {
            include: request.query.include === 'profile' ? 'account.profile' : undefined
          }).catch(function (error) {
            if (error.status === 404) {
              throw errors.INVALID_SESSION
            }
          })
        }

        throw error
      })

      .then(function (session) {
        return accounts.remove(session.account, {
          include: request.query.include
        })
      })

      .then(function (account) {
        if (request.query.include) {
          return reply(serialise(account)).code(200)
        }

        reply().code(204)
      })

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  server.route([
    getAccountRoute,
    patchAccountRoute,
    signUpRoute,
    destroyAccountRoute
  ])

  next()
}
