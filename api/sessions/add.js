module.exports = addSession

var calculateSessionId = require('couchdb-calculate-session-id')

var errors = require('../utils/errors')
var validatePassword = require('../utils/validate-password')
var toAccount = require('../utils/doc-to-account')

function addSession (state, properties, options, request) {
  var hooks = options.hooks || {}
  var db = request.pre.usersDb
  return db.get('org.couchdb.user:' + properties.username)

  .then(function (doc) {
    return new Promise(function (resolve, reject) {
      validatePassword(
        properties.password,
        doc.salt,
        doc.iterations,
        doc.derived_key,
        function (error, isCorrectPassword) {
          console.log(error)
          console.log(isCorrectPassword)
          if (error) {
            return reject(error)
          }

          if (!isCorrectPassword) {
            return reject(errors.UNAUTHORIZED_PASSWORD)
          }

          resolve(doc)
        }
      )
    })
  })

  .then(function (doc) {
    var sessionTimeout = 1209600 // 14 days
    var bearerToken = calculateSessionId(
      doc.name,
      doc.salt,
      state.secret,
      Math.floor(Date.now() / 1000) + sessionTimeout
    )

    var session = {
      id: bearerToken,
      account: toAccount(doc, {
        includeProfile: properties.include === 'account.profile'
      })
    }

    return session
  })
}
