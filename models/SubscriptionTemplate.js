var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var subscriptionTemplateSchema = new Schema({
    label: String, //free
    tickers: [String],
    horizon: String
})

var SubscriptionTemplate = mongoose.model('SubscriptionTemplate', subscriptionTemplateSchema);
module.exports = SubscriptionTemplate;