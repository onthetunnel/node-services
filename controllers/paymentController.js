var ethers = require('ethers')
const bot = require('../util/telegramBot').bot
const nopreview_markdown_opts = require('../util/telegramBot').nopreview_markdown_opts
var network = process.env.LOCAL_ENV ? ethers.providers.networks.ropsten : ethers.providers.networks.mainnet
var itfEthWallet = process.env.ITF_ETH_PAYMENT_WALLET
var marketApi = require('../api/market')
var UserModel = require('../models/User')
var dates = require('../util/dates')

console.log(`Deploying blockchain provider on ${network.name}`)
//var etherscanProvider = new ethers.providers.EtherscanProvider(network)
//var abi = require('../util/abi')
//var ittContractAddress = process.env.CONTRACT_ADDRESS
//var contract = new ethers.Contract(ittContractAddress, abi, etherscanProvider)

const TEST_DECIMALS = 18
const ITT_DECIMALS = 8
const ETH_DECIMALS = 18

const smartContractDecimals = process.env.LOCAL_ENV ? TEST_DECIMALS : ITT_DECIMALS
const smartContractTokenSymbol = process.env.LOCAL_ENV ? 'ABC' : 'ITT'
var itfEmitter = require('../util/blockchainNotifier')
var blockchainUtil = require('../util/blockchainUtil')

itfEmitter.on('itfTransfer', tx => {
    console.log(`[Event] verifying transaction ${tx.transactionHash}`)
    verifyTransaction(tx).then(user => {
        if (user) {
            var expDate = user.settings.subscriptions.paid
            bot.sendMessage(user.telegram_chat_id, `Subscription | Transaction confirmed

[Transaction info](https://etherscan.io/tx/${tx.transactionHash})
Premium signals days: ${dates.getDaysLeftFrom(expDate)}
Starter plan expires on: ${expDate.toDateString()}
Configure your preferences with the /wizard!`, nopreview_markdown_opts)
        }
    }).catch(err => { console.log(err) })
})

module.exports = paymentController = {
    getUserStatus: async (telegram_chat_id) => {
        var user = await UserModel.findOne({ telegram_chat_id: telegram_chat_id })
        if (!user || user.length < 0) throw new Error('User not found')

        var expDate = user.settings.subscriptions.paid

        return {
            telegram_chat_id: telegram_chat_id,
            expirationDate: expDate,
            subscriptionDaysLeft: Math.max(0, dates.getDaysLeftFrom(expDate)),
            walletAddress: user.settings.ittWalletReceiverAddress
        }
    },
    verifyTransaction: (transaction) => verifyTransaction(transaction),
    verifyEthTransaction: (signatureObj) => verifyEthTransaction(signatureObj)
}

function verifyTransaction(transaction) {
    return UserModel.findOne({ 'settings.ittWalletReceiverAddress': transaction.returnValues.to })
        .then(async (user) => {
            return registerPayment(user, transaction.transactionHash, transaction.returnValues.value, 'ITT')
        })
}


//msg: transaction hash without 0x
function verifyEthTransaction(signatureObj) {
    const { telegram_chat_id, address, msg, sig } = signatureObj
    var result = blockchainUtil.verifySignature(sig, address, msg)
    if (result.verified) {
        return blockchainUtil.getTransaction(`0x${msg}`).then(txResult => {
            const { from, to, value } = txResult
            if (from.toLowerCase() == address.toLowerCase() && to.toLowerCase() == itfEthWallet.toLowerCase()) {

                return UserModel.findOne({ telegram_chat_id: telegram_chat_id }).then(user => {
                    return registerPayment(user, txResult.hash, txResult.value, 'ETH').then(updateUser => {
                        console.log(`✅ ${telegram_chat_id} is getting a nice subscription upgrade of ${value} wei to ITF to days`)
                        return { ...txResult, telegram_chat_id: telegram_chat_id, success: true }
                    }).catch(err => {
                        console.log(err)
                        return { ...txResult, telegram_chat_id: telegram_chat_id, success: false, reason: err.message }
                    })
                })
            } else
                console.log('Ooops, impossible to verify your tx')
            return { ...txResult, telegram_chat_id: telegram_chat_id, success: false }
        })
    }
}

async function registerPayment(user, txHash, amount, symbol) {
    if (user && user.settings.ittTransactions.map(t => t.tx).indexOf(txHash) < 0) {

        var ticker_price_usd = -1
        if (symbol == 'ETH') {
            tickerJson = await marketApi.tickers(symbol)
            ticker_price_usd = tickerJson[0].price_usd
        }
        else {
            tickerJson = await marketApi.itt()
            ticker = JSON.parse(tickerJson)
            ticker_price_usd = ticker.close
        }

        var tokens = weiToToken(amount, symbol)

        //20$ in ITT = 1 month
        var usdPricePerSecond = 20 * 12 / 365.25 / 24 / 3600
        //100ITT * 0.04 = 4$
        var secondsToAdd = tokens * ticker_price_usd / usdPricePerSecond
        var startingDate = new Date(Math.max(new Date(), user.settings.subscriptions.paid))
        var newExpirationDate = startingDate.setSeconds(startingDate.getSeconds() + secondsToAdd)
        user.settings.subscriptions.paid = newExpirationDate
        user.settings.ittTransactions.push({
            tx: txHash,
            total: tokens,
            usdt_rate: ticker_price_usd,
            paid_with: symbol
        })
        user.settings.subscriptionRenewed = { plan: 'paid', on: Date.now() }
        user.save()
        return user
    }

    throw new Error(`Transaction ${txHash} already verified for user ${user.telegram_chat_id}`)
}

function weiToToken(weiValue, tickerSymbol) {
    var decimalPlaces = tickerSymbol == 'ETH' ? ETH_DECIMALS : smartContractDecimals
    return parseInt(weiValue) / (10 ** parseInt(decimalPlaces))
}