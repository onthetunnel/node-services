var dbapi = require('../api/userControllerHelper')
var marketapi = require('../api/market')
var User = require('../models/User')

module.exports = {
    getUsers: (req, res) => {
        dbapi.getUsers(req.query).then(users => {
            res.send(users);
        }).catch(reason => res.sendStatus(500).send(reason));
    },
    getUser: (req, res) => {
        User.findOne({ telegram_chat_id: parseInt(req.params.id) }).then(user => {
            user ? res.send(user) : res.sendStatus(404)
        }).catch(reason => res.status(500).send(reason));
    },
    createUser: (req, res) => {
        User.create(req.body).then((newUser) => {
            return res.status(201).send(newUser)
        }).catch((reason) => {
            console.log(reason.message);
            if (reason.code == 11000 && reason.name === 'MongoError') {
                return res.status(500).send('Duplicate Chat Id');
            }
            return res.status(500).send(reason.message);
        });
    },
    updateUser: (req, res) => {
        dbapi.updateUserSettings(req.params.id, req.body).then(user => {
            return res.send(user);
        }).catch(reason => {
            return res.status(500).send(reason)
        })
    },
    updateUserCurrencies: (req, res) => {

        var currenciesPairRoles = ['transaction', 'counter']
        if (currenciesPairRoles.indexOf(req.params.currenciesPairRole) < 0) {
            res.sendStatus(404)
        }
        else {
            dbapi.updateUserCurrencies(req.params.id, req.body, req.params.currenciesPairRole)
                .then((user) => {
                    res.send(user);
                }).catch(reason => {
                    res.status(500).send(reason)
                })
        }
    },
    selectAllSignals: (req, res) => {

        return User.findOne({ telegram_chat_id: parseInt(req.params.id) }).then(user => {
            return Promise.all([user, marketapi.tickers(), marketapi.counterCurrencies()])
        }).then(results => {
            var user = results[0];
            var tkrs = results[1];
            var tickersSymbols = tkrs.map(tkr => tkr.symbol);
            var ccs = results[2];

            var settings = {};
            Object.keys(user.settings).forEach(property => {
                settings[property] = user.settings[property]
            })
            settings.counter_currencies = [0, 2];
            settings.transaction_currencies = tickersSymbols;
            return settings
        }).then(data => {
            return dbapi.updateUserSettings(req.params.id, data)
        }).then((user) => {
            res.send(user);
        }).catch(reason => {
            res.status(500).send(reason)
        });
    }
}