// Pipe and Filter / Chain of Responsibility (Lecture 4):
// each check looks at the inspection context and either passes (returns null)
// or returns the violation. Checks run in order and the FIRST failure decides
// the result.
// Modifiability (Lecture 7, "localize changes"): to add a new rule, add one
// object to this array. Nothing else in the system has to change.

const checks = [
    {
        name: "Token recognised",
        run: ({ token, qrError }) => token ? null : {
            reason: "Invalid Token",
            message: qrError || "This token is not registered in the system"
        }
    },
    {
        name: "Token active",
        run: ({ token }) => {
            if (token.Status === "Active") return null;
            if (token.Status === "Expired") return { reason: "Expired Token", message: "This token has expired" };
            return { reason: "Invalid Token", message: `This token is ${String(token.Status).toLowerCase()}` };
        }
    },
    {
        name: "Token in date",
        run: ({ token, now }) => token.ExpiresAt && new Date(token.ExpiresAt) < now ? {
            reason: "Expired Token",
            message: "This token passed its expiry date"
        } : null
    },
    {
        name: "Boarding scan recorded",
        run: ({ journey }) => journey ? null : {
            reason: "No Boarding Scan",
            message: "The passenger did not scan their token when boarding"
        }
    },
    {
        name: "Boarded this route",
        run: ({ journey, schedule }) => !schedule || journey.RouteId === schedule.RouteId ? null : {
            reason: "Invalid Journey",
            message: `The passenger tapped in on route ${journey.RouteNumber || journey.RouteId}, not this bus's route`
        }
    },
    {
        name: "Sufficient credit",
        run: ({ token }) => Number(token.Balance) > 0 ? null : {
            reason: "Insufficient Credit",
            message: "The account has no credit for this journey"
        }
    }
];

// Runs the checks in order and stops at the first failure.
// `steps` tells the mobile result screen which checks passed / failed.
const runChecks = (context) => {

    const steps = [];

    for (const check of checks) {

        const failure = check.run(context);

        steps.push({ name: check.name, passed: !failure });

        if (failure) {
            return { result: "Invalid", ...failure, steps };
        }
    }

    return { result: "Valid", reason: null, message: "Ticket is valid for this journey", steps };
};

module.exports = { runChecks };
