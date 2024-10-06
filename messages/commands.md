# flags.source-org.summary

Specifies the username or alias of the source Salesforce organization for data migration.

# flags.target-org.summary

Specifies the username or alias of the target Salesforce organization for data migration.

# flags.csv-source.summary

Indicates that the data source is a CSV file instead of a Salesforce organization.

# flags.csv-target.summary

Indicates that the data target is a CSV file instead of a Salesforce organization.

# flags.manifest.summary

Absolute or relative path to the package.xml file containing the metadata to retrieve from the org.

# flags.source-dir.summary

Absolute or relative path to the root folder of the metadata within the Salesforce DX project (for example, 'force-app'). Defaults to the path specified in the sfdx-project.json manifest file when run inside an SFDX project.

# flags.config-path.summary

Specifies the path to the json configuration file that defines the data migration settings.

# flags.dedup.summary

Removes duplicate sections from target metadata XML, keeping the version with the most inner properties to optimize the structure.

# flags.merge-props.summary

Merges properties from source and target sections in the output metadata XML, combining and overriding values without removing any existing properties from the target section.

# flags.type.summary

The type of metadata to merge.

# flags.keep-temp-dirs.summary

Prevents automatic deletion of temporary directories created during command execution, useful for debugging or inspection of intermediate files.

# command.start

Command %s started...

# command.end

Command %s finished!
