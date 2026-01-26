# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. **Email** the maintainer directly or use GitHub's private vulnerability reporting feature
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix release**: Depends on severity (critical: ASAP, high: within 30 days)

## Security Considerations

### macOS Permissions

This MCP server requires Accessibility permissions to interact with Apple Notes via JXA. Users must explicitly grant these permissions in:

**System Settings > Privacy & Security > Accessibility**

### Design Decisions for Safety

1. **Read-heavy operations**: The server intentionally limits write operations
2. **No delete functionality**: Notes cannot be deleted through this server
3. **Input validation**: All inputs are validated using Zod schemas
4. **HTML escaping**: Content is escaped to prevent injection attacks
5. **Timeout limits**: JXA script execution has timeout limits to prevent hanging

### Known Limitations

- This server only works on macOS
- Requires local access to the machine
- Apple Notes data is stored locally by macOS

## Best Practices for Users

1. Only grant Accessibility permissions to trusted terminals/IDEs
2. Keep the package updated to receive security patches
3. Review the source code if you have concerns
