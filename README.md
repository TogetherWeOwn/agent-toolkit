# agent-toolkit

Reusable, least-privilege tools for AI agents.

Each tool is a credential broker: it keeps a broad credential on the server
side and exposes only the narrow, validated actions an agent needs. Agents
call the tool; they never receive the credential.

The tool standard and the catalog arrive in the first pull request.

## License

MIT. See [LICENSE](LICENSE).
