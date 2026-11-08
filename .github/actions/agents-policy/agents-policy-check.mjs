// Production entry has no offline expectations, data-ref override or candidate code import.
import { compareCandidate, parseFlags, readDataCommit, readDataRef, requireSha } from "./agents-policy-data.mjs";

try {
  const options = parseFlags(process.argv.slice(2), ["--repo", "--candidate"]);
  requireSha(options["--candidate"], "--candidate");
  const readPolicy = async token => {
    const dataSha = await readDataRef(token);
    const { bundle } = await readDataCommit(dataSha, token);
    return { dataSha, bundle };
  };
  let policy;
  try { policy = await readPolicy(); }
  catch (error) {
    if (!process.env.GITHUB_TOKEN) throw error;
    policy = await readPolicy(process.env.GITHUB_TOKEN);
  }
  const { dataSha, bundle } = policy;
  console.log(`AGENTS_POLICY_OK ${JSON.stringify({ ...compareCandidate(bundle, options["--repo"], options["--candidate"]), data_commit: dataSha })}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
