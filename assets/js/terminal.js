document.addEventListener("DOMContentLoaded", () => {

    class Terminal {

        constructor() {

            this.output = document.getElementById("terminal-output");
            this.input = document.getElementById("terminal-input");

            this.history = [];
            this.historyIndex = 0;

            this.bindEvents();

            this.boot();

        }

        bindEvents() {

            this.input.focus();

            this.input.addEventListener("keydown", (e) => {

                if (e.key === "Enter") {

                    this.execute();

                }

                if (e.key === "ArrowUp") {

                    e.preventDefault();

                    this.previous();

                }

                if (e.key === "ArrowDown") {

                    e.preventDefault();

                    this.next();

                }

            });

        }

        execute() {

            const command = this.input.value.trim();

            if (!command) return;

            this.history.push(command);

            this.historyIndex = this.history.length;

            this.echo(command);

            this.run(command);

            this.input.value = "";

        }

        echo(command) {

            this.print(
                `naveen@NaveenOS:~$ ${command}`,
                "#58A6FF"
            );

        }

        run(command) {

            const cmd = command.toLowerCase();

            if (cmd === "clear") {

                this.output.innerHTML = "";
                this.boot();

                return;

            }

            const handler = registry.execute(cmd);

            if (handler) {

                this.print(handler());

                return;

            }

            this.print(

                `Command not found.

Type "help" to see available commands.`,

                "#F85149"

            );

        }

        print(text, color = "#3FB950") {

            const div = document.createElement("div");

            div.className = "output-line";

            div.style.color = color;

            div.innerHTML = `
<div class="terminal-output">
    <span class="output-icon">❯</span>
    <div class="output-text">${text.trim().replace(/\n/g, "<br>")}</div>
</div>`;;

            this.output.appendChild(div);

            this.output.scrollTop = this.output.scrollHeight;

        }

        previous() {

            if (this.historyIndex > 0) {

                this.historyIndex--;

                this.input.value = this.history[this.historyIndex];

            }

        }

        next() {

            if (this.historyIndex < this.history.length - 1) {

                this.historyIndex++;

                this.input.value = this.history[this.historyIndex];

            } else {

                this.historyIndex = this.history.length;

                this.input.value = "";

            }

        }
        boot() {

            this.print(`
Welcome to NaveenOS Terminal v2

Type "help" to begin.

`);

        }

    }

    new Terminal();

});