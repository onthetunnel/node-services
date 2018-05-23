console.log('Health Service')

var telegramBot = require('./util/telegramBot').bot
var markdown = require('./util/telegramBot').markdown
var database = require('./database')
database.connect()

var historyCtrl = require('./controllers/historyController')
var UserModel = require('./models/User')
var moment = require('moment')
var _ = require('lodash')


const MAX_HOURS_WITHOUT_SIGNAL_SHORT = 3
const MAX_HOURS_WITHOUT_SIGNAL_MEDIUM = 9
const MAX_HOURS_WITHOUT_SIGNAL_LONG = 60

var free = {
    source: 0, transaction_currencies: 'BTC+ETH+BCH+XMR+ZEC+DASH+LTC',
    counter_currency: 2, trend: 1
}

var run = () => {
    Promise.all([lastSignalDeliveredCheck(),
    checkWrongConfigurations(),
    eulaCheck()]).then(() => {
        console.log('Health check completed')
        process.exit()
    })
}

function eulaCheck() {
    if (true || moment().date() % 3 == 0 && moment().hour() == 13) {
        console.log('Checking EULA status for bot users...')
        return UserModel.find({ eula: 'false' }).then(users => {
            var notification_promises = []
            users.forEach(user => {
                var eulaMsg = `*ITT Team*\n\nWe noticed that your bot is not working. In order to use the bot you MUST accept the [End User Licensing Agreement](https://${process.env.DOMAIN}/eula?u=${user.telegram_chat_id})`
                notification_promises.push(telegramBot.sendMessage(user.telegram_chat_id, eulaMsg, markdown).catch(err => console.log(err)))
            })
            return Promise.all(notification_promises).then((fulfillments) => {
                console.log('EULA reminders sent.')
            })
        })
    }
    else
        console.log('EULA status checked every 3 days only.')
}

function lastSignalDeliveredCheck() {
    console.log('Checking signals delivered to users...')

    var not_enough_signals_message =
        `🔴 *Health Status Notification*\n\nIt looks like you're missing signals and cryptomarket updates due to your current subscription plan or configuration.
Check your /settings or /subscribe for a better experience!
Our [User Guide](http://intelligenttrading.org/guides/bot-user-guide/) can help to configure the bot properly.`

    var blind_short_users_promise = UserModel.find({ $and: [{ eula: true }, { 'settings.lastSignalReceived.on': { $lt: moment().add(-1 * MAX_HOURS_WITHOUT_SIGNAL_SHORT, 'hours').format('YYYY-MM-DD HH:MM') } }, { 'settings.horizon': 'short' }] })
    var blind_medium_users_promise = UserModel.find({ $and: [{ eula: true }, { 'settings.lastSignalReceived.on': { $lt: moment().add(-1 * MAX_HOURS_WITHOUT_SIGNAL_MEDIUM, 'hours').format('YYYY-MM-DD HH:MM') } }, { 'settings.horizon': 'medium' }] })
    var blind_long_users_promise = UserModel.find({ $and: [{ eula: true }, { 'settings.lastSignalReceived.on': { $lt: moment().add(-1 * MAX_HOURS_WITHOUT_SIGNAL_LONG, 'hours').format('YYYY-MM-DD HH:MM') } }, { 'settings.horizon': 'long' }] })

    return Promise.all([blind_short_users_promise, blind_medium_users_promise, blind_long_users_promise])
        .then(users => {
            var blind_users = _.concat(users[0], users[1], users[2])

            blind_users.forEach(blind_user => {
                telegramBot.sendMessage(blind_user.telegram_chat_id, not_enough_signals_message, markdown)
                    .catch(err => console.log(err))
            })
        })
}

function checkWrongConfigurations() {
    console.log('Checking possible misconfigurations...')

    var no_counter_currencies_message = '🔴 *Health Status Notification*\n\nYou have no valid trading pair selected and no signals can be delivered!\n Check you signals /settings to be sure you have at least one valid trading pair!'

    return UserModel.find({ 'settings.counter_currencies.0': { $exists: false } }).then(no_counter_currencies_users => {

        if (no_counter_currencies_users) {
            no_counter_currencies_users.filter(user => user.eula).forEach(nccu => {
                telegramBot.sendMessage(nccu.telegram_chat_id, no_counter_currencies_message, markdown)
                    .catch(err => console.log(err))
            })
        }
    })
}

run()