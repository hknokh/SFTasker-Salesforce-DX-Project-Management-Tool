import { Flags } from '@salesforce/sf-plugins-core';
import { CommandUtils } from '../../components/command-utils.js';
import { Constants } from '../../components/constants.js';
import { ApiUtils } from '../../components/api-utils.js';
import { SFtaskerCommand } from '../../components/models.js';
import { FindMatchingFilesResult } from '../../components/types.js';
import { Utils } from '../../components/utils.js';

/** Represents the result of the Sftasker Merge Meta command. */
export type SftaskerMergeMetaResult = Record<string, never>;

// Set up the command messages using CommandUtils utility.
const messages = CommandUtils.setupCommandMessages('sftasker', 'merge-meta');

/**
 * Command class for merging metadata using Sftasker.
 *
 * @extends SFtaskerCommand
 */
export default class SftaskerMergeMeta extends SFtaskerCommand<SftaskerMergeMetaResult> {
  /** Summary of the command. */
  public static readonly summary = messages.commandMessages.getMessage('summary');

  /** Description of the command. */
  public static readonly description = messages.commandMessages.getMessage('description');

  /** Examples of how to use the command. */
  public static readonly examples = messages.commandMessages.getMessages('examples');

  /** Defines the flags/options for the command. */
  public static readonly flags = {
    /** Specifies the target Salesforce org. (Required) */
    'target-org': Flags.requiredOrg(),

    /** Specifies the API version to use. */
    'api-version': Flags.orgApiVersion({
      char: 'a',
    }),

    /** Specifies the path to the manifest file. */
    manifest: Flags.string({
      summary: messages.commandMessages.getMessage('flags.manifest.summary'),
      char: 'x',
      default: Constants.DEFAULT_MANIFEST_PATH,
    }),

    /** Specifies the source directory path. */
    'source-dir': Flags.string({
      summary: messages.commandMessages.getMessage('flags.source-dir.summary'),
      char: 'p',
      required: false,
    }),

    /** Enables deduplication of metadata files. (Hidden) */
    dedup: Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.dedup.summary'),
      char: 'd',
      hidden: true, // This flag is managed internally
    }),

    /** Enables merging of properties in metadata files. (Hidden) */
    'merge-props': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.merge-props.summary'),
      char: 'e',
      hidden: true, // This flag is managed internally
    }),

    /** Specifies the type of metadata to merge. */
    type: Flags.option({
      summary: messages.commandMessages.getMessage('flags.type.summary'),
      char: 't',
      required: true,
      options: ['Profile', 'CustomLabels', 'Translations'] as const,
    })(),

    /** Indicates whether to keep temporary directories after execution. */
    'keep-temp-dirs': Flags.boolean({
      summary: messages.commandMessages.getMessage('flags.keep-temp-dirs.summary'),
      char: 'k',
    }),
  };

  /**
   * Executes the Merge Meta command to merge metadata based on the provided flags and configuration.
   *
   * @returns The result of the merge operation.
   */
  public async run(): Promise<SftaskerMergeMetaResult> {
    // Parse the command-line flags provided by the user.
    const { flags } = await this.parse(SftaskerMergeMeta);

    // Initialize CommandUtils with the current command instance.
    const commandUtils = new CommandUtils(this);

    // Set up the command instance with the necessary messages and flags.
    commandUtils.setupCommandInstance(messages, flags);

    // Log a message indicating the start of the command execution.
    commandUtils.logCommandStartMessage();

    // Create a temporary directory for the command execution.
    const tempPath = commandUtils.createTempDirectory();

    // Initialize ApiUtils with the current command instance and temporary path.
    const metadataUtils = new ApiUtils(this, tempPath);

    // Get the root folder for the specified metadata type.
    const forceAppMetadataRootFolder = metadataUtils.getMetadataRootFolder(flags.type);
    // Log the metadata root folder being used.
    commandUtils.logCommandMessage('command.progress.metadata-root-folder', forceAppMetadataRootFolder);

    // Retrieve metadata from the manifest file and store it in a temporary folder.
    const manifestTempFolder = (await metadataUtils.retrievePackageMetadataAsync(flags.manifest)) as string;
    // Log the path to the manifest's temporary folder.
    commandUtils.logCommandMessage('command.progress.manifest-temp-folder', manifestTempFolder);

    // List metadata files specified in the manifest.
    const manifestMetadataFiles = metadataUtils.listMetadataFiles(flags.type, manifestTempFolder);

    // List metadata files present in the local force-app project.
    const forceAppMetadataFiles = metadataUtils.listMetadataFiles(flags.type);
    // Log the number of local metadata files found.
    commandUtils.logCommandMessage('command.progress.found-local-files', forceAppMetadataFiles.length.toString());

    // Find matching metadata files between the manifest and the local force-app project.
    commandUtils.logCommandMessage('command.progress.finding-matching-files');
    const matchingManifest2ForceAppMetadataFiles: FindMatchingFilesResult = Utils.findMatchingFiles(
      manifestMetadataFiles,
      forceAppMetadataFiles,
      Constants.PACKAGE_XML_METADATA_NAME_TO_FILE_REGEX_REPLACE_MAPPING[flags.type]
    );

    // Check if there are no matching or missing files to merge.
    if (
      matchingManifest2ForceAppMetadataFiles.matchingFiles.length === 0 &&
      matchingManifest2ForceAppMetadataFiles.missingFiles.length === 0
    ) {
      // Log that there are no components to merge and exit early.
      commandUtils.logCommandMessage('command.result.no-components-to-merge');
      return {};
    }

    // Merge each of the matching metadata files into the force-app project folder.
    commandUtils.logCommandMessage(
      'command.progress.processing-matching-files',
      matchingManifest2ForceAppMetadataFiles.matchingFiles.length.toString()
    );
    for (const matchingFile of matchingManifest2ForceAppMetadataFiles.matchingFiles) {
      metadataUtils.mergeMetadataXml(
        matchingFile.dir1Path,
        matchingFile.dir2Path,
        matchingFile.dir2Path,
        Constants.PACKAGE_XML_METADATA_NAME_TO_XNL_METADATA_FILE_ROOT_TAG_MAPPING[flags.type],
        Constants.METADATA_SECTION_KEY_MAPPING[flags.type]
      );
    }

    // If there are missing metadata files, copy them to the force-app project.
    if (matchingManifest2ForceAppMetadataFiles.missingFiles.length > 0) {
      // Log the number of missing files being copied.
      commandUtils.logCommandMessage(
        'command.progress.copying-missing-files',
        matchingManifest2ForceAppMetadataFiles.missingFiles.length.toString()
      );

      // Copy the missing files to the target metadata root folder.
      Utils.copyFiles(
        matchingManifest2ForceAppMetadataFiles.missingFiles,
        forceAppMetadataRootFolder,
        Constants.PACKAGE_XML_METADATA_NAME_TO_FILE_REGEX_REPLACE_MAPPING[flags.type]
      );
    }

    // If the user does not want to keep temporary directories, delete them.
    if (!flags['keep-temp-dirs']) {
      // Delete the temporary directory used for the manifest.
      commandUtils.deleteTempDirectory(manifestTempFolder);
    }

    // Log a message indicating the completion of the command execution.
    commandUtils.logCommandEndMessage();

    // Return an empty result as defined by SftaskerMergeMetaResult.
    return {};
  }
}
