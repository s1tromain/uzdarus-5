import { spawnSync } from "child_process";

const result = spawnSync(process.execPath, ["validation_test.js"], {
    stdio: "inherit"
});

if (typeof result.status === "number") {
    process.exitCode = result.status;
} else {
    process.exitCode = 1;
}

