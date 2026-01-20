# Contributing to OpenPaean

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+ or Bun (recommended)
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/paean-ai/openpaean.git
cd openpaean

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run build
```

## Code Style

- Use TypeScript for all source files
- Follow existing code patterns
- Use meaningful variable and function names
- Add JSDoc comments for exported functions

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/your-feature`
3. **Commit** your changes with clear messages
4. **Test** your changes locally
5. **Push** to your fork and create a Pull Request

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Update documentation if needed
- Add tests for new functionality
- Ensure CI passes before requesting review

## Reporting Issues

When reporting bugs, please include:

- OpenPaean version (`openpaean --version`)
- Node.js/Bun version
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## Security

For security vulnerabilities, please see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
