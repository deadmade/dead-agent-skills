// Codex install prose. It is generated into the Codex distribution only; plugins/ never carries it.
export function integrationSetup(name: string) {
  const commands: Record<string, string> = {
    'web-mcp': 'codex mcp add dead-agent-skills-web-mcp -- web-mcp',
    'mcp-github':
      'codex mcp add dead-agent-skills-mcp-github --url https://api.githubcopilot.com/mcp --bearer-token-env-var GITHUB_PERSONAL_ACCESS_TOKEN',
    'mcp-azure': 'codex mcp add dead-agent-skills-mcp-azure -- ado-mcp',
    atlassian: 'codex mcp add dead-agent-skills-atlassian --url https://mcp.atlassian.com/v1/mcp',
  };
  let setup = `Use the native Codex CLI to configure this integration; no project installer is required.\n\n\`\`\`sh\n${commands[name]}\n\`\`\`\n\nNever paste credentials into chat or package files. Preserve an existing server with this name and ask before replacing it.`;
  if (name === 'web-mcp')
    setup +=
      '\n\nPut the web-mcp release binary on PATH (or use its absolute path in the command). Install agent-browser separately for browser/search tools; fetch uses it for browser fallback; lookup works without it. Release binaries: https://github.com/deadmade/dead-claude-skills/releases .';
  if (name === 'mcp-github')
    setup +=
      '\n\nSet GITHUB_PERSONAL_ACCESS_TOKEN in the environment that starts Codex, then restart Codex. Do not put the token in the manifest.';
  if (name === 'mcp-azure')
    setup +=
      '\n\nPut the ado-mcp release binary on PATH (or use its absolute path in the command). Set ADO_ORG_URL (the Azure DevOps Server collection URL) and ADO_PAT in the environment that starts Codex. In the native server table [mcp_servers.dead-agent-skills-mcp-azure], add env_vars = ["ADO_ORG_URL", "ADO_PAT", "ADO_PROJECT_DIR"]. ADO_PROJECT_DIR optionally overrides the repository used for project detection. Preserve all unrelated configuration; ask for missing non-secret preferences. Release binaries: https://github.com/deadmade/dead-claude-skills/releases .';
  if (name === 'atlassian')
    setup +=
      '\n\nComplete OAuth with codex mcp login dead-agent-skills-atlassian. Authentication is a separate user action.';
  return setup;
}

export function packageReadme(name: string) {
  if (name === 'flows')
    return '# Codex flows\n\nInstall directly from this marketplace:\n\n```sh\ncodex plugin add flows@dead-agent-skills\ncodex plugin add dead-skills@dead-agent-skills\ncodex plugin add graphify@dead-agent-skills\ncodex plugin add web-mcp@dead-agent-skills\n```\n\nCodex does not install Claude dependency declarations. Companion integrations are optional at runtime: see references/flow-rules.md for fallbacks, and run the web-mcp setup skill to configure its server. Packs, reviewer briefs and graphify resources are bundled. No installer or build is required.\n';
  if (name === 'dead-skills')
    return '# Shared coding rules, Night City and Context7\n\nRun the setup-night-city skill to copy the packaged native theme safely and select it with /theme. No installer is required.\n\nThe trusted startup hook supplies shared coding rules. Review and trust hooks in Codex, then verify a fresh session before removing any installer-managed global rules block. Existing user instructions are preserved. The project-rules skill also carries the conventions. Context7 can be configured without an installer:\n\n```sh\ncodex mcp add dead-agent-skills-dead-skills --url https://mcp.context7.com/mcp\n```\n';
  return `# ${name}\n\n${integrationSetup(name)}\n\nThe setup skill guides native MCP registration and authentication. Installing this setup plugin alone does not register a global MCP server.\n`;
}
export const INTEGRATIONS = ['web-mcp', 'mcp-github', 'mcp-azure', 'atlassian'];
export const READMES = ['flows', 'dead-skills', ...INTEGRATIONS];
export const setupSkill = (name: string) =>
  `---\nname: setup-${name}\ndescription: Set up the ${name} integration installed by dead-agent-skills.\n---\n\n${integrationSetup(name)}\n`;
