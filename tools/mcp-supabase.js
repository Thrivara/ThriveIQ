#!/usr/bin/env node
/*
 * Launch Supabase MCP server (requires package installed in your project):
 *   npm i -D @supabase/mcp-server-supabase
 */
const { spawn } = require('child_process');

const { SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN } = process.env;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN in environment.');
  process.exit(1);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['-y', '@supabase/mcp-server-supabase', '--read-only', `--project-ref=${SUPABASE_PROJECT_REF}`];
const child = spawn(cmd, args, {
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_ACCESS_TOKEN },
});

child.on('exit', (code) => process.exit(code ?? 0));
