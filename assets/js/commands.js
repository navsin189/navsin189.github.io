registry.register("help", () => [
    "Available Commands",
    "",
    "help",
    "whoami",
    "coffee",
    "clear"
].join("\n"));

registry.register("whoami", () => [
    "Naveen Kumar Singh",
    "",
    "DevOps Engineer",
    "",
    "Professional YAML Archaeologist"
].join("\n"));

registry.register("coffee", () => `
Coffee Level

██████████

100%

Ready for deployment ☕
`);