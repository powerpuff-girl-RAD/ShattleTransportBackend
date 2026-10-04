const crypto = require('crypto');
const env = require('../config/env');

let stripeInstance = null;
if (env.stripe.secretKey) {
    try {
        const Stripe = require('stripe');
        stripeInstance = new Stripe(env.stripe.secretKey);
    } catch (err) {
        console.warn('Stripe SDK initialization failed, falling back to Simulator:', err.message);
    }
}

/**
 * Detects card brand from number.
 */
const detectCardBrand = (cleanNumber) => {
    if (/^4/.test(cleanNumber)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) return 'Mastercard';
    if (/^3[47]/.test(cleanNumber)) return 'Amex';
    return 'Card';
};

/**
 * Maps card number/brand to Stripe sandbox test tokens.
 * Stripe requires test tokens (e.g. tok_visa) when creating charges from server-side APIs.
 */
const resolveStripeTestToken = (cleanNumber) => {
    if (/^4/.test(cleanNumber)) return 'tok_visa';
    if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) return 'tok_mastercard';
    if (/^3[47]/.test(cleanNumber)) return 'tok_amex';
    if (/^6/.test(cleanNumber)) return 'tok_discover';
    return 'tok_visa';
};

/**
 * Validates card payload parameters.
 */
const validateCardPayload = ({ cardNumber, expiry, cvv, amount }) => {
    const topUpAmount = Number(amount);
    if (isNaN(topUpAmount) || topUpAmount <= 0) {
        const err = new Error('Invalid top-up amount.');
        err.statusCode = 400;
        throw err;
    }

    if (topUpAmount > 50000) {
        const err = new Error('Maximum top-up amount is LKR 50,000 per transaction.');
        err.statusCode = 400;
        throw err;
    }

    if (!cardNumber) {
        const err = new Error('Card number is required.');
        err.statusCode = 400;
        throw err;
    }

    const cleanCard = cardNumber.replace(/\s+/g, '');
    if (cleanCard.length < 12 || cleanCard.length > 19 || !/^\d+$/.test(cleanCard)) {
        const err = new Error('Invalid card number. Must be between 12 and 19 digits.');
        err.statusCode = 400;
        throw err;
    }

    if (cvv && !/^\d{3,4}$/.test(cvv.trim())) {
        const err = new Error('Invalid CVV code. Must be 3 or 4 digits.');
        err.statusCode = 400;
        throw err;
    }

    return {
        amount: topUpAmount,
        cleanCard,
        cardLast4: cleanCard.slice(-4),
        cardType: detectCardBrand(cleanCard),
    };
};

/**
 * Processes card payment through Stripe if configured, or through the Secure Simulator.
 */
const processCardPayment = async ({
    amount,
    currency = 'LKR',
    cardNumber,
    expiry,
    cvv,
    cardholderName,
}) => {
    const validated = validateCardPayload({ cardNumber, expiry, cvv, amount });

    // ── 1. If Stripe Secret Key is present, charge via Stripe API ───────────
    if (stripeInstance) {
        try {
            // Map test card to Stripe test token (tok_visa, tok_mastercard, tok_amex)
            const testSourceToken = resolveStripeTestToken(validated.cleanCard);

            // Create Charge in Stripe
            const charge = await stripeInstance.charges.create({
                amount: Math.round(validated.amount * 100), // convert to cents / smallest unit
                currency: currency.toLowerCase(),
                source: testSourceToken,
                description: `Shattel Transit Wallet Top-Up: ${currency} ${validated.amount} (${cardholderName || 'Passenger'})`,
            });

            return {
                gateway: 'Stripe',
                gatewayRef: charge.id,
                cardLast4: validated.cardLast4,
                cardType: validated.cardType,
                status: 'Completed',
            };
        } catch (stripeError) {
            const err = new Error(`Payment Gateway Error: ${stripeError.message}`);
            err.statusCode = 400;
            throw err;
        }
    }

    // ── 2. Fallback: Shattel Test Payment Gateway Simulator ──────────────────
    // Generates cryptographic gateway authorization code for testing
    const gatewayRef = `GW-AUTH-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    return {
        gateway: 'Shattel Gateway Simulator (Test Mode)',
        gatewayRef,
        cardLast4: validated.cardLast4,
        cardType: validated.cardType,
        status: 'Completed',
    };
};

module.exports = {
    detectCardBrand,
    resolveStripeTestToken,
    validateCardPayload,
    processCardPayment,
};