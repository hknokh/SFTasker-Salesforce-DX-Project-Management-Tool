# summary

Merges Salesforce profiles from the org with local profiles, intelligently adding or updating components without deleting existing configurations.

# description

The `merge-profile` command merges profiles retrieved from a Salesforce org with local profile files in the current SFDX project. It ensures components are added or updated without deleting existing configurations, providing a non-destructive, smart merge process.

Key Features:

- Smart Merge: Automatically updates or adds components without overwriting existing settings.
- Non-destructive: Ensures no deletions during the merge process.
- Profile Component Handling: Supports merging of field-level security, object settings, tab visibility, and more.
- Multiple Profile Support: Merge multiple profiles at once for efficient synchronization.
- Conflict Resolution: Handles conflicts to ensure accurate updates without losing customizations.

# examples

- <%= config.bin %> <%= command.id %> -t CustomLabels
- <%= config.bin %> <%= command.id %> -t CustomLabels -p force-app
- <%= config.bin %> <%= command.id %> -t Profile -o ORG-ALIAS -x absolute/path/to/force/project/manifest/package.xml -p absolute/path/to/force/project/force-app

# flags.manifest.summary

Absolute or relative path to the package.xml file containing the profiles to retrieve from the org.

# flags.source-dir.summary

Absolute or relative path to the root folder of the metadata within the Salesforce DX project (for example, 'force-app'). Defaults to the path specified in the sfdx-project.json manifest file when run inside an SFDX project.

# flags.dedup.summary

Removes duplicate sections from target metadata XML, keeping the version with the most inner properties to optimize the structure.

# flags.merge-props.summary

Merges properties from source and target sections in the output metadata XML, combining and overriding values without removing any existing properties from the target section.

# flags.type.summary

The type of metadata to merge.

# flags.keep-temp-dirs.summary

Prevents automatic deletion of temporary directories created during command execution, useful for debugging or inspection of intermediate files.

# command.progress.metadata-root-folder

Target metadata root folder: %s

# command.progress.manifest-temp-folder

Temporary folder for retrieved metadata: %s

# command.progress.found-local-files

Found %s local components.

# command.progress.finding-matching-files

Comparing local components with retrieved components...

# command.result.no-components-to-merge

No components to merge.

# command.progress.processing-matching-files

Processing %s matching components...

# command.progress.copying-missing-files

Copying %s missing components...

# command.start

Command %s started...

# command.end

Command %s finished!
