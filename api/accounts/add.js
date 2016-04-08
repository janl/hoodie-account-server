module.exports = addAccount

var randomstring = require('randomstring')

var errors = require('../utils/errors')
var toAccount = require('../utils/doc-to-account')

function addAccount (state, properties, options, request) {
  if (!options) {
    options = {}
  }
  var accountKey = 'org.couchdb.user:' + properties.username
  var accountId = properties.id || randomstring.generate({
    length: 12,
    charset: 'hex'
  })

  var doc = {
    _id: accountKey,
    type: 'user',
    name: properties.username,
    password: properties.password,
    roles: [
      'id:' + accountId
    ].concat(properties.roles || [])
  }

  var hooks = options.hooks || {}

  if (hooks.account && hooks.account.beforeAdd &&
    typeof hooks.account.beforeAdd === 'function') {
    doc = hooks.account.beforeAdd(doc, request)
  }

  // var db = state.db
  // if (hooks.db && typeof hooks.db === 'function') {
  //   db = hooks.db(request)
  // }
  var db = request.pre.usersDb
  return db.put(doc)

  .catch(function (error) {
    if (error.status === 409) {
      throw errors.USERNAME_EXISTS
    }
    throw error
  })

  .then(function () {

    var profile = toAccount(doc, {
      includeProfile: options.include === 'profile'
    })

    // emit signup event
    state.accountsEmitter.emit('signup', profile)

    return profile
  })
}
