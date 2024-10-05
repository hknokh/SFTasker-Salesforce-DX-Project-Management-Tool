# SFTasker: Salesforce DX Project Management Tool

`sftasker` is a powerful **Salesforce CLI plugin** designed for Salesforce developers and administrators. It includes a set of commands that simplify Salesforce DX project management, addressing specific tasks like metadata merging for Profiles, Translations, and Custom Labels. These automation tools help reduce manual effort, prevent data loss, and improve workflow efficiency, making it easier to manage complex Salesforce projects.

⚠ **Note:** This is an unofficial Salesforce plugin and is not endorsed or supported by Salesforce. Be sure to thoroughly test it before using it in production environments.

## Available Commands

### `merge-meta` Command

#### Use Case

The `merge-meta` command addresses a common issue when working with Salesforce metadata, such as Profiles, Custom Labels, or Translations. In Salesforce DX projects, metadata files often contain multiple sections that represent different settings, such as permissions, labels, and translations. When retrieving metadata, only certain sections may be pulled, causing other sections in the file to be lost.

#### The Problem with Partial Metadata Retrieval

Metadata files like **Profiles**, **Translations**, and **Custom Labels** consist of multiple sections that define settings for all permissions, labels, or translations. For example, a Profile file might include sections for object permissions, field-level security, user permissions, and other settings. The same issue occurs for **Custom Labels** and **Translations**, as these metadata types also have multiple sections in a single file. Retrieving only a part of the file can result in the loss of other sections.

When you retrieve only a specific component (e.g., `objectPermissions` for the `Account` object), the Salesforce CLI overwrites the entire file with just the retrieved section. This results in other sections, such as `fieldPermissions`, being lost from the file, even though they weren't part of the current operation.

##### Example:

Here is an example of a `package.xml` manifest file that retrieves only the `Admin` Profile and the `Account` custom object:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Admin</members>
        <name>Profile</name>
    </types>
    <types>
        <members>Account</members>
        <name>CustomObject</name>
    </types>
    <version>57.0</version>
</Package>
```

This `package.xml` will retrieve the `objectPermissions` for the `Account` object as part of the `Admin` Profile. However, since the Salesforce CLI pulls only the specified components, it might overwrite the Profile metadata file (`Admin.profile-meta.xml`), causing sections like `fieldPermissions`, `userPermissions`, and others to be lost.

**Before retrieval:**

Below is an example of a Profile metadata file (`Admin.profile-meta.xml`) that contains both `objectPermissions` and `fieldPermissions` sections:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <userPermissions>
        <enabled>true</enabled>
        <name>ViewAllData</name>
    </userPermissions>
    <fieldPermissions>
        <field>Account.Name</field>
        <readable>true</readable>
        <editable>true</editable>
    </fieldPermissions>
    <objectPermissions>
        <object>Account</object>
        <allowCreate>true</allowCreate>
        <allowDelete>true</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <viewAllRecords>false</viewAllRecords>
    </objectPermissions>
</Profile>
```

**After retrieval:**

If you retrieve only the `objectPermissions` for the `Account` object, the CLI might overwrite the entire file with just this section, causing the `fieldPermissions` section to be lost:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <object>Account</object>
        <allowCreate>true</allowCreate>
        <allowDelete>true</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <viewAllRecords>false</viewAllRecords>
    </objectPermissions>
</Profile>
```

As you can see, the `fieldPermissions` and `userPermissions` sections are missing after the retrieval, even though it wasn’t part of the operation.

#### How `merge-meta` Solves This

The `merge-meta` command prevents such data loss by intelligently merging the newly retrieved metadata sections with the existing ones in the file, ensuring that no settings are lost during the retrieval process. For example, when you retrieve the `objectPermissions` section, the command will merge it with the existing `fieldPermissions` and other sections in the file, rather than overwriting the entire file.

This approach preserves all the sections that were not part of the current retrieval, allowing developers and administrators to work more efficiently and confidently without the risk of losing important metadata. This applies to **Custom Labels** and **Translations** as well, where multiple components are stored in one file, and partial retrieval can also result in data loss if not properly merged.

#### Running the `merge-meta` Command

Below is the full format to run the `merge-meta` command using the console:

```bash
$ sf sftasker merge-meta -o <value> -t Profile|CustomLabels|Translations [--json] [--manifest <value>] [--apiversion <value>] [-r <value>]
```

##### Flags

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

##### Option 1: Running the Plugin from the SFDX Project Root

It is recommended to run the plugin from the **root of the SFDX project**. By doing so, the plugin can use the default project settings, such as the default org and the standard `manifest/package.xml` location, reducing the need to explicitly specify certain flags:

```bash
$ sf sftasker merge-meta -t Profile
```

##### Option 2: Running the Plugin Outside the SFDX Project Root

When running the plugin **outside the SFDX project root**, you will need to explicitly specify the `-r` flag to point to the root folder of the metadata, the `-m` flag to provide the path to the `package.xml` file, and `-o` to define the Salesforce org connection to retrieve the metadata from, as the plugin cannot automatically detect these settings:

```bash
$ sf sftasker merge-meta -o MY-ORG -t Profile -m "path/to/sfdx/root/manifest/profiles.xml" -r "path/to/sfdx/root/force-app/main/default"
```

#### Notes

- **Use Version Control**: It is recommended to use version control (e.g., Git) to store your Salesforce DX project. This allows you to easily track changes made by the plugin and provides a safety net if unintended changes occur.
- **Overrides Target Directory**: The `merge-meta` command overrides the metadata in the target directory specified by the `-r` flag. Ensure that the correct path is provided to avoid unintentional modifications.
- **Metadata Retrieval Timeout**: The command has a maximum metadata retrieval timeout of 5 minutes. Avoid using overly large `package.xml` files; instead, prefer smaller packages with only necessary components to ensure successful retrieval.
- **Temporary Data Storage**: The command stores downloaded resources in a temporary directory located at `./tmp/sftasker/[orgId]/[random dir name]`. A new random directory is created with each command execution.
- **Avoid Including StaticResources**: Do not include `StaticResource` in the `package.xml` for `merge-meta`, as it may cause retrieval issues and incomplete merges. Handle StaticResources separately to avoid conflicts.
- **Working with Multiple Profiles**: When using the `-t Profile` flag, the plugin can handle multiple profile files in a single call, including using a wildcard (`*`) to select all profiles.

## Installation of the `sftasker` Plugin

### Installation for the Salesforce CLI

1. **Fresh installation of the Plugin**.

   Run the following command in the Terminal:

```bash
$ sf plugins install sftasker
```

Because this plugin is not signed, you may see a warning during installation. Proceed by confirming with `y` (yes) to continue.

2. **Update the Plugin**.

   To update the Plugin, you should uninstall and install it again.

   Run the following commands in the Terminal:

```bash
$ sf plugins uninstall sftasker
$ sf plugins install sftasker
```

### Installation and Running from Source Code

If you prefer to run `sftasker` directly from the source without installing it as a plugin via `sf plugins install`, follow these steps:

1. **Clone the repository**:

   ```bash
   $ git clone https://github.com/hknokh/sftasker.git
   $ cd sftasker
   ```

2. **Install dependencies**:

   Run the following command to install all the required dependencies:

   ```bash
   $ npm install
   ```

3. **Run the plugin commands locally**:

   After installing the source code, for example, to run the `merge-meta` command, you can use:

   ```bash
   $ ./bin/dev sftasker merge-meta -o MY-ORG -t Profile -m "path/to/sfdx/root/manifest/profiles.xml" -r "path/to/sfdx/root/force-app/main/default"
   ```

4. **Linking the plugin locally using `sf plugins link`**:

   To use the plugin source code as a normal SF CLI Plugin, you can link the plugin to your local Salesforce CLI with the following command:

   ```bash
   $ sf plugins link
   ```

   Once linked, you can run the plugin commands as a normal SF CLI Plugin. For example, to run from the Salesforce DX project root:

   ```bash
   $ sf sftasker merge-meta -t Profile
   ```

## Debugging

To debug the `sftasker` plugin using **Visual Studio Code**, follow these steps:

1. **Clone the repository**:

   First, clone the `sftasker` repository from GitHub:

   ```bash
   $ git clone https://github.com/hknokh/sftasker
   $ cd sftasker
   ```

2. **Install dependencies**:

   Run the following command to install all required dependencies:

   ```bash
   $ npm install
   ```

   If you encounter any dependency issues, you can run the following command to automatically fix them:

   ```bash
   $ npm audit fix
   ```

3. **Set breakpoints in Visual Studio Code**:

   - Open the `sftasker` project in **Visual Studio Code**.
   - Navigate to the relevant `.ts` (TypeScript) files where you want to inspect the code.
   - Set breakpoints in the desired locations by clicking on the left margin next to the line numbers.

4. **Run the CLI command in the VS Code terminal**:

   Open the **terminal** in VS Code and run the following command (`merge-meta` or whichever command you are debugging):

   ```bash
   $ ./bin/debug sftasker merge-meta -t Translations -o DEMO-SOURCE -m "C:\path\to\sfdx-project\manifest\package.xml" -r "C:\path\to\sfdx-project\force-app\main\default"
   ```

5. **Attach the Debugger**:

   - After running the command, go to the **Run and Debug** tab on the left sidebar of VS Code.
   - Select the **Attach** configuration from the dropdown menu.
   - Click the green **Start Debugging** button (or press `F5`).
   - The debugger will attach to the running process, and you can now step through the code.

6. **Investigate the code**:

   Once attached, you can step through the code, inspect variables, and analyze how the plugin processes your metadata.

If the issue persists, please create an issue in the [GitHub Issue Tracker](https://github.com/hknokh/sftasker/issues) with detailed steps, logs, and configuration files.

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

## Author

- **[hknokh](https://github.com/hknokh)** - Author and maintainer of the `sftasker` plugin.

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE.txt) file for more details.

## Disclaimer

This plugin is provided "as-is" with no warranties or guarantees. It is not an official Salesforce product. Always test in a development or sandbox environment before deploying to production.
