const userService = require("../service/user.service");


// GET /api/users
const getAll = async (req, res, next) => {
    try {
        const employees = await userService.getAllEmployees();
        res.status(200).json({
            success: true,
            data: employees
        });
    } catch (error) {
        next(error);
    }
};


// POST /api/users
const create = async (req, res, next) => {

    try {

        const employee = await userService.createEmployee(req.body);

        res.status(201).json({
            success: true,
            message: "Employee created successfully",
            data: employee
        });

    } catch (error) {

        next(error);
    }
};


// PUT /api/users/:id
const update = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const employee = await userService.updateEmployee(id, req.body);

        res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: employee
        });

    } catch (error) {

        next(error);
    }
};


// DELETE /api/users/:id
const remove = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        await userService.deleteEmployee(id);

        res.status(200).json({
            success: true,
            message: "Employee deleted successfully"
        });

    } catch (error) {

        next(error);
    }
};


module.exports = {
    getAll,
    create,
    update,
    remove
};
