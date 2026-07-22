class CommandRegistry {

    constructor() {

        this.commands = {};

    }

    register(name, handler) {

        this.commands[name.toLowerCase()] = handler;

    }

    execute(name) {

        return this.commands[name.toLowerCase()] || null;

    }

    list() {

        return Object.keys(this.commands);

    }

}

const registry = new CommandRegistry();