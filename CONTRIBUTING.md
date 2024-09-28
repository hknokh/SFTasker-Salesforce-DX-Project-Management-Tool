Here’s an updated version of the `CONTRIBUTING.md` file with your specific code of conduct and security issue guidelines:

---

# Contributing to `sftasker`

Thank you for considering contributing to the `sftasker` CLI plugin. This guide provides instructions on how to set up your environment, run tests, and submit contributions.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
3. [Running the Project](#running-the-project)
   - [Compiling the Code](#compiling-the-code)
   - [Linting](#linting)
   - [Testing](#testing)
4. [Creating a Pull Request](#creating-a-pull-request)
5. [Branching Model](#branching-model)
6. [Commit Message Guidelines](#commit-message-guidelines)
7. [Security Issues](#security-issues)
8. [License](#license)

## Code of Conduct

This project adheres to the [Code of Conduct](./CODE_OF_CONDUCT.md) outlined in this repository. By participating, you are expected to uphold this code. Please report unacceptable behavior through the appropriate channels outlined in the document.

## Getting Started

### Prerequisites

To contribute, ensure you have the following installed:

- Node.js >= 18.0.0
- npm (we use npm instead of yarn)
- Salesforce CLI installed (optional for Salesforce-specific functionality)

### Installation

1. Fork the repository from GitHub: [hknokh/sftasker](https://github.com/hknokh/sftasker).
2. Clone your forked repository locally:

   ```bash
   git clone https://github.com/YOUR-USERNAME/sftasker.git
   cd sftasker
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Set up Husky for pre-commit hooks:

   ```bash
   npx husky install
   ```

## Running the Project

### Compiling the Code

To compile the TypeScript files, use:

```bash
npm run compile
```

### Linting

To ensure the code adheres to our linting rules, run:

```bash
npm run lint
```

We use ESLint with the Salesforce plugin rules to maintain code quality. Fix linting issues by running:

```bash
npm run lint -- --fix
```

### Testing

We rely on `mocha` for unit tests. To run tests, execute:

```bash
npm test
```

For NUT (non-unit test) specific testing, use:

```bash
npm run test:nuts
```

### Clean-up

Before submitting your code, clean up any generated artifacts:

```bash
npm run clean
```

## Creating a Pull Request

When you're ready to submit your changes:

1. Make sure your fork is up to date:

   ```bash
   git checkout main
   git pull upstream main
   ```

2. Create a new branch for your feature or bug fix:

   ```bash
   git checkout -b my-feature
   ```

3. After making your changes, push them to your fork:

   ```bash
   git push origin my-feature
   ```

4. Open a pull request against the main repository from your fork.

### Pull Request Guidelines

- Keep PRs small and focused.
- Include appropriate test coverage for your changes.
- Ensure the code passes linting and tests before submitting.
- Link related issues in your PR description.

## Branching Model

We follow a simplified Git Flow:

- `main`: The stable branch, ready for release.
- `feature/branch-name`: Use this format for your feature or bug fix branches.

## Commit Message Guidelines

We use conventional commits for consistent commit history. Example format:

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

Common commit types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Formatting, missing semi colons, etc.; no code change
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or correcting tests
- `chore`: Build process or auxiliary tool changes

## Security Issues

If you discover any security vulnerabilities, please report them by creating an issue in the repository's [issue tracker](https://github.com/hknokh/sftasker/issues). Use the provided security issue template when creating the issue to ensure all necessary information is included.

## License

By contributing to `sftasker`, you agree that your contributions will be licensed under the [MIT License](./LICENSE.txt).

---

This updated `CONTRIBUTING.md` reflects your own code of conduct and security issue process.
