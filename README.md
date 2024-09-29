# SFTasker: Salesforce DX Project Management Tool

[TOC]

`sftasker` is a powerful SF CLI plugin designed for Salesforce Developers and Administrators. It contains a set of useful commands that streamline Salesforce DX project management, addressing tasks like metadata merging for Profiles, Translations, and CustomLabels. These automation tools help reduce manual effort, prevent data loss, and improve overall workflow efficiency, making it easier to manage complex Salesforce projects.

⚠ **Note:** This is an unofficial Salesforce plugin and is not endorsed or supported by Salesforce. Please test thoroughly before using in production environments.

## Installation

### Installing the Plugin for Salesforce CLI

To install `sftasker`, run:

```bash
sf plugins install sftasker
```

Because this plugin is not signed, you may see a warning during installation. Proceed by confirming with `y` (yes) to continue.

To update the plugin, uninstall it and then reinstall it:

```bash
sf plugins uninstall sftasker
sf plugins install sftasker
```

### Running the Plugin from Source Code

If you prefer to run `sftasker` directly from source without installing it as a plugin, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/hknokh/sftasker.git
   cd sftasker
   ```

2. **Install dependencies:**

   Run the following command to install all the required dependencies:

   ```bash
   npm install
   ```

3. **Run the plugin commands locally:**

   After installing dependencies, you can execute any of the plugin's commands using the following format:

   ```bash
   ./bin/dev sftasker <command> [options]
   ```

   For example, to run the `merge-meta` command, you can use:

   ```bash
   ./bin/dev sftasker merge-meta -o <orgAlias> -t Profile -m "path/to/package.xml" -r "path/to/metadata-root"
   ```

   This allows you to test and use the plugin's commands without installing it via `sf plugins install`.

4. **Linking the plugin locally using `sf plugins link`:**

   To use the plugin source code locally as a linked plugin and avoid running it from the development directory each time, you can link the plugin to your local Salesforce CLI with the following command:

   ```bash
   sf plugins link
   ```

   This will link the local plugin to your Salesforce CLI, making it available globally like a normally installed plugin. Once linked, you can run the plugin commands directly from any directory without having to use `./bin/dev`.

   For example:

   ```bash
   sf sftasker merge-meta -o <orgAlias> -t Profile -m "path/to/package.xml" -r "path/to/metadata-root"
   ```

5. **Debugging:**

   To debug the plugin, follow the instructions in the [Debugging](#debugging) section below using Visual Studio Code.

## `merge-meta` Command

### Use Case

The `merge-meta` command is designed to solve a common problem when working with Salesforce metadata, such as `Profiles`, `CustomLabels`, or `Translations`. This command is typically used to manage metadata in Salesforce DX projects.

### The Problem with Partial Metadata Retrieval

When pulling metadata from a Salesforce org, such as **Profiles**, **Translations**, or **Custom Labels**, the default behavior of most of tools (including the Salesforce CLI) is to retrieve only the specified components. However, when using a partial `package.xml` (one that includes only certain components), the retrieved metadata files may contain only a subset of the data. This creates several problems:

1. **Incomplete Data**: Only a subset of the profile, translation, or custom labels is retrieved. The local metadata files may lose sections that were not included in the retrieval process, causing important metadata to be lost in your local project.
2. **Overwriting Local Files**: The retrieved metadata files can overwrite existing local files, replacing them with incomplete data that includes only the components specified in the `package.xml`.
3. **Reordering of Sections**: When pulling _all components_ (using a wildcard `*` in the `package.xml`), tools often reorder sections in the profile or custom labels files. This makes it difficult to track and review changes in version control, as the reordering creates unnecessary noise in the Git diff, even if no actual changes were made.

### Examples of the Problem

#### Partial `package.xml` for **Profiles**

Suppose you have profiles with permissions for multiple objects and fields, but you want to retrieve changes only for a specific custom object `CustomObject__c`. Your `package.xml` might look like this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <!-- Include the custom object -->
  <types>
    <members>CustomObject__c</members>
    <name>CustomObject</name>
  </types>
  <!-- Include the profiles -->
  <types>
    <members>YourProfileName</members>
    <name>Profile</name>
  </types>
  <version>56.0</version>
</Package>
```

When you run the standard retrieve command, the retrieved profile file `YourProfileName.profile-meta.xml` will contain permissions **only** for `CustomObject__c`. This will **overwrite your local profile file**, potentially removing permissions for all other objects, fields, and settings not included in the retrieval.

#### Partial `package.xml` for **Custom Labels**

Assuming you want to retrieve only a few custom labels, your `package.xml` might look like this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>LabelOne</members>
    <members>LabelTwo</members>
    <name>CustomLabel</name>
  </types>
  <version>56.0</version>
</Package>
```

When you retrieve these labels, your `CustomLabels.labels-meta.xml` file will be replaced with only `LabelOne` and `LabelTwo`. **All other labels in the file will be lost**.

#### Partial `package.xml` for **Translations**

Suppose you have multiple translations set up for various components in your org, but you want to retrieve translations only for specific custom labels, such as `LabelOne` and `LabelTwo`. Your `package.xml` might look like this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <!-- Specify the language of the translations -->
  <types>
    <members>en_US</members>
    <name>Translations</name>
  </types>
  <!-- Include the specific custom labels -->
  <types>
    <members>LabelOne</members>
    <members>LabelTwo</members>
    <name>CustomLabel</name>
  </types>
  <version>56.0</version>
</Package>
```

When you run the standard retrieve command, the retrieved translation file `en_US.translation-meta.xml` will contain translations **only** for `LabelOne` and `LabelTwo`. **All other translations in the file will be lost**, potentially removing translations for other custom labels, custom objects, and other components.

#### Why This Happens

Salesforce's Metadata API treats certain metadata types, like **Profile**, **CustomLabels**, and **Translations**, as single files that contain multiple components. When you retrieve a subset of these components, the API returns a file containing only those components. If you overwrite your existing local file with this partial file, you lose any components that were not included in the retrieval.

### The Solution: Using `merge-meta`

To prevent loss of data when retrieving partial metadata, you can use the `merge-meta` command. This command retrieves the metadata specified in the `package.xml` file, just like Salesforce CLI does, but with an additional smart merging capability. It merges the retrieved components with your existing local files, updating only the metadata specified without removing others.

Unlike standard retrieval methods, `merge-meta` focuses on the metadata type specified by the `-t` flag. This means that it updates only the components of that specific type (e.g., **Profile**, **CustomLabels**, or **Translations**) while leaving other types of metadata in your project untouched.

Here's how `merge-meta` helps:

- **Preserves Existing Data**: It adds or updates only the specified components in your local metadata files, leaving other components of the same type untouched.
- **Prevents Overwriting**: It prevents the retrieved partial metadata from overwriting your entire local file by intelligently merging new data with the existing components.
- **Maintains Order**: It preserves the original order of components in your local files, avoiding unnecessary reordering and reducing noise in version control diffs.

Below is how to run the `merge-meta` command using the Console.

```bash
$ sf sftasker merge-meta -o <value> -t Profile|CustomLabels|Translations [--json] [--manifest <value>] [--apiversion <value>] [-r <value>]
```

#### Flags

- **`-o, --target-org=<value>`**: The alias or username of the target Salesforce org. **Note**: The `-o` flag can be omitted if you run the command from within a Salesforce DX project where the default org is already set.

- **`-m, --manifest=<value>`**: Path to the `package.xml` file for metadata retrieval. **Note**: This flag is mandatory when the plugin is run from **outside** the Salesforce DX project directory. However, it is optional when running from inside the project, as it defaults to the standard `manifest/package.xml` location.

- **`-t, --type=<Profile|CustomLabels|Translations>`** (required): The type of metadata to merge. **Note**: The `package.xml` can include other metadata types, but the plugin will only focus on the metadata type specified by the `--type` flag.

- **`-r, --metadata-root-folder=<value>`**: Local folder where metadata is stored. **Note**: When running the command **outside** the SFDX project root, you need to specify the `-r` flag explicitly to locate and access the project's metadata. However, when running inside the SFDX project root, the plugin automatically uses the default metadata path specified in the `sfdx-project.json` file. This means the `-r` flag can be omitted if the plugin runs within the SFDX project root and the correct path is defined in `sfdx-project.json`.

- **`--apiversion=<value>`**: Override the API version used for Salesforce requests.

- **`--json`**: Formats the output as JSON. When the command succeeds, it returns an empty result with a `'status': 0` response, as shown below:

  ```json
  {
    "status": 0,
    "result": {},
    "warnings": []
  }
  ```

  **Note**: When the `--json` flag is provided, it suppresses all other standard output (stdout) log messages.

#### Running the Plugin from the SFDX Project Root

It is recommended to run the plugin from the **root of the SFDX project**. By doing so, the plugin can use the default project settings, such as the default org and the standard `manifest/package.xml` location, reducing the need to explicitly specify certain flags.

#### Running the Plugin Outside the SFDX Project Root

When running the plugin **outside the SFDX project root**, you will need to explicitly specify the `-r` flag to point to the root folder of the metadata and the `-m` flag to provide the path to the `package.xml` file, as the plugin cannot automatically detect these settings.

### Notes

- **Use Version Control**: It is recommended to use version control (e.g., Git) to store your Salesforce DX project. This allows you to easily track changes made by the plugin and provides a safety net if unintended changes occur.
- **Overrides Target Directory**: The `merge-meta` command overrides the metadata in the target directory specified by the `-r` flag. Ensure that the correct path is provided to avoid unintentional modifications.
- **Metadata Retrieval Timeout**: The command has a maximum metadata retrieval timeout of 5 minutes. Avoid using overly large `package.xml` files; instead, prefer smaller packages with only necessary components to ensure successful retrieval.
- **Temporary Data Storage**: The command stores downloaded resources in a temporary directory located at `./tmp/sftasker/[orgId]/[random dir name]`. A new random directory is created with each command execution.
- **Avoid Including StaticResources**: Do not include `StaticResource` in the `package.xml` for `merge-meta`, as it may cause retrieval issues and incomplete merges. Handle StaticResources separately to avoid conflicts.
- **Working with Multiple Profiles**: When using the `-t Profile` flag, the plugin can handle multiple profile files in a single call, including using a wildcard (`*`) to select all profiles.

## Versioning

This project follows [Semantic Versioning](https://semver.org/). For each release:

- **Major**: Breaking changes or significant feature updates.
- **Minor**: New features that are backward compatible.
- **Patch**: Bug fixes or minor improvements.

You can view the full list of versions and release notes in the [Changelog](./CHANGELOG.md).

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the repository.
2. Create a new branch with a descriptive name (`feature/your-feature`).
3. Make your changes.
4. Run tests and ensure the code passes linting.
5. Submit a pull request.

For more detailed instructions, check out the [CONTRIBUTING.md](./CONTRIBUTING.md).

## Debugging

To debug the `sftasker` plugin using **Visual Studio Code**, follow these steps:

1. **Clone the repository:**

   First, clone the `sftasker` repository from GitHub:

   ```bash
   git clone https://github.com/hknokh/sftasker
   cd sftasker
   ```

2. **Install dependencies:**

   Run the following command to install all required dependencies:

   ```bash
   npm install
   ```

   If you encounter any dependency issues, you can run the following command to automatically fix them:

   ```bash
   npm audit fix
   ```

3. **Set breakpoints in Visual Studio Code:**

   - Open the `sftasker` project in **Visual Studio Code**.
   - Navigate to the relevant `.ts` (TypeScript) files where you want to inspect the code.
   - Set breakpoints in the desired locations by clicking on the left margin next to the line numbers.

4. **Run the CLI command in the VS Code terminal:**

   Open the **terminal** in VS Code and run the following command (or whichever command you are debugging):

   ```bash
   ./bin/dev sftasker merge-meta -t Translations -o DEMO-SOURCE -m "C:\path\to\sfdx-project\manifest\package.xml" -r "C:\path\to\sfdx-project\force-app\main\default"
   ```

5. **Attach the Debugger:**

   - After running the command, go to the **Run and Debug** tab on the left sidebar of VS Code.
   - Select the **Attach** configuration from the dropdown menu.
   - Click the green **Start Debugging** button (or press `F5`).
   - The debugger will attach to the running process, and you can now step through the code.

6. **Investigate the code:**

   Once attached, you can step through the code, inspect variables, and analyze how the plugin processes your metadata.

If the issue persists, please create an issue in the [GitHub repository](https://github.com/hknokh/sftasker/issues) with detailed steps, logs, and configuration files.

## Dependencies and Libraries

This project utilizes several dependencies and libraries to provide functionality, ranging from CLI frameworks to XML parsing and Salesforce integration. Below is a brief explanation of each:

### Core Dependencies

- **[@oclif/core](https://www.npmjs.com/package/@oclif/core)**: Provides the core framework for building CLI applications. It is used to structure and manage commands, handle arguments and flags, and generate help output.
- **[@salesforce/core](https://www.npmjs.com/package/@salesforce/core)**: A library that provides the core components required to interact with Salesforce. It includes authentication, connection management, and Salesforce API interactions.
- **[@salesforce/sf-plugins-core](https://www.npmjs.com/package/@salesforce/sf-plugins-core)**: A library of common functionality used by Salesforce CLI plugins, offering a set of utilities to streamline plugin development and enhance compatibility within Salesforce environments.
- **[@types/object-path](https://www.npmjs.com/package/@types/object-path)**: Provides TypeScript type definitions for the `object-path` library, which is used to manipulate and navigate deeply nested objects.
- **[fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser)**: A high-performance XML parser and validator that converts XML data to JSON and vice versa. This is used to efficiently process Salesforce metadata files.
- **[object-path](https://www.npmjs.com/package/object-path)**: A utility library that allows manipulation of deeply nested objects, making it easier to access, modify, and work with large metadata structures in the Salesforce environment.
- **[unzipper](https://www.npmjs.com/package/unzipper)**: A library used for extracting files from ZIP archives, which is often needed when handling compressed Salesforce metadata files.
- **[husky](https://www.npmjs.com/package/husky)**: A tool for managing Git hooks, enabling you to enforce pre-commit and pre-push checks such as linting, testing, or formatting automatically before committing code.

### Development Dependencies

- **[@oclif/plugin-command-snapshot](https://www.npmjs.com/package/@oclif/plugin-command-snapshot)**: A plugin used to create and verify command snapshots during testing, ensuring CLI commands function as expected across updates.
- **[@salesforce/cli-plugins-testkit](https://www.npmjs.com/package/@salesforce/cli-plugins-testkit)**: Provides a set of tools and helpers to test Salesforce CLI plugins, ensuring they work correctly in different environments.
- **[@salesforce/dev-scripts](https://www.npmjs.com/package/@salesforce/dev-scripts)**: A set of scripts and configuration files used to automate common development tasks, such as building, testing, and linting the project.
- **[@types/unzipper](https://www.npmjs.com/package/@types/unzipper)**: TypeScript type definitions for the `unzipper` library, ensuring that ZIP file extraction operations are properly typed and safe.
- **[eslint-plugin-sf-plugin](https://www.npmjs.com/package/eslint-plugin-sf-plugin)**: An ESLint plugin providing rules and configurations specifically for Salesforce CLI plugins, helping to maintain consistent code quality and style.
- **[oclif](https://www.npmjs.com/package/oclif)**: The Oclif framework is used for building the CLI tool, providing the foundation for command parsing, help generation, and other core features.
- **[ts-node](https://www.npmjs.com/package/ts-node)**: A utility that enables TypeScript to be directly executed in a Node.js environment, without needing to compile the TypeScript code into JavaScript first.
- **[typescript](https://www.npmjs.com/package/typescript)**: The TypeScript compiler, which is used to compile TypeScript code to JavaScript. It provides type safety and modern JavaScript features during development.

## Author

- **[hknokh](https://github.com/hknokh)** - Author and maintainer of the `sftasker` plugin.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE.txt) file for more details.

## Disclaimer

This plugin is provided "as-is" with no warranties or guarantees. It is not an official Salesforce product. Always test in a development or sandbox environment before deploying to production.
