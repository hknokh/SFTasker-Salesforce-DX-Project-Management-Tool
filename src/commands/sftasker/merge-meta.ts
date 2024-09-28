import { Messages } from '@salesforce/core';
import { Flags } from '@salesforce/sf-plugins-core';
import { CommandUtils } from '../../components/command-utils.js';
import { Constants } from '../../components/constants.js';
import { MetadataUtils } from '../../components/metadata-utils.js';
import { SFtaskerCommand } from '../../components/models.js';
import { FindMatchingFilesResult } from '../../components/types.js';
import { Utils } from '../../components/utils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);

const messages = Messages.loadMessages('sftasker', 'merge-meta');
const componentsMessages = Messages.loadMessages('sftasker', 'components');

export type SftaskerMergeMetaResult = Record<string, never>;

// eslint-disable-next-line sf-plugin/only-extend-SfCommand
export default class SftaskerMergeMeta extends SFtaskerCommand<SftaskerMergeMetaResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  // eslint-disable-next-line sf-plugin/spread-base-flags
  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    apiversion: Flags.orgApiVersion(),

    manifest: Flags.string({
      summary: messages.getMessage('flags.manifest.summary'),
      char: 'm',
      default: Constants.DEFAULT_MANIFEST_PATH,
    }),

    'metadata-root-folder': Flags.string({
      summary: messages.getMessage('flags.metadata-root-folder.summary'),
      char: 'r',
      required: false,
    }),

    dedup: Flags.boolean({
      summary: messages.getMessage('flags.dedup.summary'),
      char: 'd',
      hidden: true, // This flag is managed internally
    }),

    'merge-props': Flags.boolean({
      summary: messages.getMessage('flags.merge-props.summary'),
      char: 'e',
      hidden: true, // This flag is managed internally
    }),

    type: Flags.option({
      summary: messages.getMessage('flags.type.summary'),
      char: 't',
      required: true,
      options: ['Profile', 'CustomLabels', 'Translations'] as const,
    })(),
  };

  public async run(): Promise<SftaskerMergeMetaResult> {
    const { flags } = await this.parse(SftaskerMergeMeta);

    // Set up the command with the necessary properties
    CommandUtils.setupCommand(this, messages, componentsMessages, flags);

    CommandUtils.logCommandMessage(this, 'command.start', this.id as string);

    // Create a temporary directory for the command execution
    const tempPath = CommandUtils.createTempDirectory(this);

    // Create an instance of the MetadataUtils class
    const metadataUtils = new MetadataUtils(this, tempPath);

    // Set the metadata root folder
    const metadataTargetRootFolder = metadataUtils.getMetadataRootFolder(flags.type);
    CommandUtils.logCommandMessage(this, 'command.progress.metadata-root-folder', metadataTargetRootFolder);

    // Retrieve the metadata from the manifest file
    const manifestTempFolder = await metadataUtils.retrievePackageMetadataAsync(flags.manifest);
    CommandUtils.logCommandMessage(this, 'command.progress.manifest-temp-folder', manifestTempFolder);

    // List metadata files of Profile type in the manifest
    const manifestProfileFiles = metadataUtils.listMetadataFiles(flags.type, manifestTempFolder);

    // List metadata files of Profile type in the force-app project
    const forceAppProfileFiles = metadataUtils.listMetadataFiles(flags.type);
    CommandUtils.logCommandMessage(this, 'command.progress.found-local-files', forceAppProfileFiles.length.toString());

    // Find matching profile files in the manifest and force-app project
    CommandUtils.logCommandMessage(this, 'command.progress.finding-matching-files');

    const matchingProfileFiles: FindMatchingFilesResult = Utils.findMatchingFiles(
      manifestProfileFiles,
      forceAppProfileFiles,
      Constants.PACKAGE_XML_METADATA_NAME_TO_FILE_REGEX_REPLACE_MAPPING[flags.type]
    );

    if (matchingProfileFiles.matchingFiles.length === 0 && matchingProfileFiles.missingFiles.length === 0) {
      CommandUtils.logCommandMessage(this, 'command.result.no-components-to-merge');
      return {};
    }

    // Processing each matching profile file
    CommandUtils.logCommandMessage(
      this,
      'command.progress.processing-matching-files',
      matchingProfileFiles.matchingFiles.length.toString()
    );
    for (const profileFile of matchingProfileFiles.matchingFiles) {
      metadataUtils.mergeMetadataXml(
        profileFile.dir1Path,
        profileFile.dir2Path,
        profileFile.dir2Path,
        Constants.PACKAGE_XML_METADATA_NAME_TO_XNL_METADATA_FILE_ROOT_TAG_MAPPING[flags.type],
        Constants.METADATA_SECTION_KEY_MAPPING[flags.type]
      );
    }

    if (matchingProfileFiles.missingFiles.length > 0) {
      // Copy missing profile files to the force-app project
      CommandUtils.logCommandMessage(
        this,
        'command.progress.copying-missing-files',
        matchingProfileFiles.missingFiles.length.toString()
      );

      Utils.copyFiles(
        matchingProfileFiles.missingFiles,
        metadataTargetRootFolder,
        Constants.PACKAGE_XML_METADATA_NAME_TO_FILE_REGEX_REPLACE_MAPPING[flags.type]
      );
    }

    // Log the command completion message
    CommandUtils.logCommandMessage(this, 'command.end', this.id as string);

    return {};
  }
}
