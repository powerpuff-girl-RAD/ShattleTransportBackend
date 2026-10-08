const { badRequest } = require("../../../utils/errors");
const { optionalFareId, requiredText, splitRange } = require("../../../utils/validators");

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

module.exports = {
    collection: "timeBasedFares",

    validate(items) {
        return items.map((fare, index) => {
            const field = `timeBasedFares[${index}]`;
            const [startWindow, endWindow] = splitRange(fare.window, `${field}.window`);

            if (!TIME_PATTERN.test(startWindow) || !TIME_PATTERN.test(endWindow)) {
                throw badRequest(`${field}.window must use 24-hour HH:mm values`);
            }

            const applies = requiredText(fare.applies, `${field}.applies`).toUpperCase();
            let appliesFrom;
            let appliesTo;

            if (applies === "ALL DAYS") {
                appliesFrom = "ALL";
                appliesTo = "ALL";
            } else {
                [appliesFrom, appliesTo] = splitRange(applies, `${field}.applies`);

                if (!/^[A-Z]{3}$/.test(appliesFrom) || !/^[A-Z]{3}$/.test(appliesTo)) {
                    throw badRequest(`${field}.applies must be a weekday range or ALL DAYS`);
                }
            }

            return {
                Id: optionalFareId(fare.Id ?? fare.id, field),
                period: requiredText(fare.period, `${field}.period`),
                startWindow,
                endWindow,
                appliesFrom,
                appliesTo,
                fareRule: requiredText(fare.rule, `${field}.rule`),
                status: requiredText(fare.status, `${field}.status`)
            };
        });
    }
};
