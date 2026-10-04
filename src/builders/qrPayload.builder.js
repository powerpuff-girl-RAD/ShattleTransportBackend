// Builder: assembles the human-readable QR text for a schedule
class QrPayloadBuilder {

    constructor() {
        this.lines = ["SHATTLE TRIP"];
    }

    withSchedule(scheduleId) {
        this.lines.push(`Schedule #: ${scheduleId}`);
        return this;
    }

    withRoute(routeName) {
        this.lines.push(`Route: ${routeName ?? "-"}`);
        return this;
    }

    withVehicle(vehicleName) {
        this.lines.push(`Vehicle: ${vehicleName ?? "-"}`);
        return this;
    }

    withInspector(inspector) {
        this.lines.push(`Inspector: ${inspector || "-"}`);
        return this;
    }

    withDate(date) {
        this.lines.push(`Date: ${date}`);
        return this;
    }

    withTime(startTime, endTime) {
        this.lines.push(`Time: ${startTime} - ${endTime}`);
        return this;
    }

    withStatus(status) {
        this.lines.push(`Status: ${status}`);
        return this;
    }

    build() {
        return this.lines.join("\n");
    }
}

module.exports = QrPayloadBuilder;
