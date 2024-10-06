# summary

Merges Salesforce Profiles, Translations, or Custom Labels from the org with local metadata, intelligently adding or updating components while preserving existing configurations.

# description

The `merge-meta` command addresses a common issue in Salesforce metadata management, especially for Profiles, Custom Labels, or Translations. In Salesforce DX projects, metadata files often contain multiple sections representing different settings, such as permissions, labels, and translations. When retrieving metadata using tools like Salesforce CLI, only certain sections may be pulled, potentially causing other sections to be lost.

# examples

- <%= config.bin %> <%= command.id %> -t CustomLabels
- <%= config.bin %> <%= command.id %> -t CustomLabels -p force-app
- <%= config.bin %> <%= command.id %> -t Profile -o ORG-ALIAS -x absolute/path/to/force/project/manifest/package.xml -p absolute/path/to/force/project/force-app

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
