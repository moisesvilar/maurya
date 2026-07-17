/** Entry del ejecutable maurya-cli: delega en runCli con stdout/stderr reales. */
import { runCli } from './cli'

process.exitCode = runCli(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`)
})
