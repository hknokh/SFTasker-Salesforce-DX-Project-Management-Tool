import { AvailableMetadataTypes, FilenameRegexpReplacement, SftaskerCommandFlags } from './types.js';

/**
 * Constants used in the application.
 */
export class Constants {
  /**
   * The name of the components resource.
   *
   * @static
   * @memberof Constants
   */
  public static readonly COMPONENTS_RESOURCE_NAME = 'components';

  /**
   * The name of the commands resource.
   * @static
   * @memberof Constants
   */
  public static readonly COMMANDS_COMMON_RESOURCE_NAME = 'commands';

  /**
   * The path to the temporary directory used for command execution.
   *
   * @static
   * @memberof Constants
   */
  public static readonly TEMP_PATH = '/tmp';

  /**
   * The default API version used in the application.
   *
   * @static
   * @memberof Constants
   */
  public static readonly DEFAULT_API_VERSION = '61.0';

  /**
   * The default path to the force-app project manifest file.
   *
   * @static
   * @memberof Constants
   */
  public static readonly DEFAULT_MANIFEST_PATH = 'manifest/package.xml';

  /**
   * The timeout for polling metadata retrieval.
   *
   * @static
   * @memberof Constants
   */
  public static readonly POLL_TIMEOUT = 300_000;

  /**
   * The mapping betweeen the metadata type and the section key in the metadata file.
   *
   * @static
   * @memberof Constants
   */
  public static readonly METADATA_SECTION_KEY_MAPPING = {
    // Profile section key mapping
    Profile: {
      custom: '',
      userLicense: '',
      applicationVisibilities: 'application',
      classAccesses: 'apexClass',
      customMetadataTypeAccesses: 'name',
      customPermissions: 'name',
      externalDataSourceAccesses: 'externalDataSource',
      fieldPermissions: 'field',
      flowAccesses: 'flow',
      layoutAssignments: 'layout,recordType',
      loginHours: '',
      loginIpRanges: '',
      objectPermissions: 'object',
      pageAccesses: 'apexPage',
      profileActionOverrides: 'actionName',
      recordTypeVisibilities: 'recordType',
      tabVisibilities: 'tab',
      userPermissions: 'name',
      '*': 'name',
    },

    CustomLabels: {
      labels: 'fullName',
    },

    Translations: {
      flowDefinitions: 'fullName',
      standardValueSetTranslations: 'standardValueSetName',
      '*': 'name',
    },
  };

  /**
   * The mapping between the metadata type names in the package.xml file and the folder names in the force-app project.
   *
   * @static
   * @memberof Constants
   */
  public static readonly PACKAGE_XML_METADATA_NAME_TO_SFDX_PROJECT_FOLDER_MAPPING: Record<string, string> = {
    ApexClass: 'classes',
    ApexPage: 'pages',
    ApexTestSuite: 'testSuites',
    ApprovalProcess: 'approvalProcesses',
    AssignmentRule: 'assignmentRules',
    AuraDefinitionBundle: 'aura',
    AuthProvider: 'authproviders',
    CampaignInfluenceModel: 'campaignInfluenceModels',
    CallCenter: 'callCenters',
    CachePartition: 'cachePartitions',
    Community: 'communities',
    ConnectedApp: 'connectedApps',
    ContentAsset: 'contentassets',
    CustomApplication: 'applications',
    CustomLabels: 'labels',
    CustomMetadata: 'customMetadata',
    CustomObject: 'objects',
    CustomObjectTranslation: 'objectTranslations',
    CustomPageWebLink: 'weblinks',
    CustomPermission: 'customPermissions',
    CustomSite: 'sites',
    CustomTab: 'tabs',
    Dashboard: 'dashboards',
    DataCategoryGroup: 'datacategorygroups',
    Document: 'documents',
    DuplicateRule: 'duplicateRules',
    EmailTemplate: 'email',
    ExternalDataSource: 'externalDataSources',
    FlexiPage: 'flexipages',
    Flow: 'flows',
    FlowDefinition: 'flowDefinitions',
    GlobalValueSet: 'globalValueSets',
    GlobalValueSetTranslation: 'globalValueSetTranslations',
    Group: 'groups',
    HomePageLayout: 'homePageLayouts',
    Layout: 'layouts',
    LeadConvertSettings: 'leadConvertSettings',
    Letterhead: 'letterheads',
    LightningComponentBundle: 'lwc',
    MatchingRule: 'matchingRules',
    MutingPermissionSet: 'mutingpermissionsets',
    NamedCredential: 'namedCredentials',
    PermissionSet: 'permissionsets',
    PermissionSetGroup: 'permissionsetgroups',
    Profile: 'profiles',
    Queue: 'queues',
    QuickAction: 'quickActions',
    RemoteSiteSetting: 'remoteSiteSettings',
    Report: 'reports',
    ReportType: 'reportTypes',
    Role: 'roles',
    SharingRule: 'sharingRules',
    StaticResource: 'staticresources',
    StandardValueSetTranslation: 'standardValueSetTranslations',
    Tab: 'tabs',
    TopicForObjects: 'topicsForObjects',
    Translations: 'translations',
    Trigger: 'triggers',
    Workflow: 'workflows',
    EmbeddedServiceConfig: 'embeddedServiceConfigs',
    EmbeddedServiceFlowConfig: 'embeddedServiceFlowConfigs',
    CustomDataType: 'customDataTypes',
    StandardValueSet: 'standardValueSets',
    ExternalServiceRegistration: 'externalServiceRegistrations',
    PlatformEventChannel: 'platformEventChannels',
    ProfilePasswordPolicy: 'profilePasswordPolicies',
    ProfileSessionSetting: 'profileSessionSettings',
    PathAssistant: 'pathAssistants',
  };

  /**
   * The mapping between the metadata type names in the package.xml file and the metadata file root tags.
   *
   * @static
   * @type {Record<string, string>}
   * @memberof Constants
   */
  public static readonly PACKAGE_XML_METADATA_NAME_TO_XNL_METADATA_FILE_ROOT_TAG_MAPPING: Record<string, string> = {
    Profile: 'Profile',
    CustomLabels: 'CustomLabels',
    Translations: 'Translations',
  };

  /**
   * The mapping between the metadata type names in the package.xml file and the regular expression and replacement for the metadata file name.
   *
   * @static
   * @type {Record<string, FilenameRegexpReplacement>}
   * @memberof Constants
   */
  public static readonly PACKAGE_XML_METADATA_NAME_TO_FILE_REGEX_REPLACE_MAPPING: Record<
    string,
    FilenameRegexpReplacement
  > = {
    Profile: {
      regexp: new RegExp('^(.*)$', 'i'),
      replace: '$1-meta.xml',
    },
    CustomLabels: {
      regexp: new RegExp('^(.*)$', 'i'),
      replace: '$1-meta.xml',
    },
    Translations: {
      regexp: new RegExp('^(.*)$', 'i'),
      replace: '$1-meta.xml',
    },
  };

  /**
   * The mapping between the metadata type names in the package.xml file and the flags used in the sftasker command.
   */
  public static readonly PACKAGE_XML_METADATA_NAME_TO_FLAG_MAPPING: Record<
    AvailableMetadataTypes,
    SftaskerCommandFlags
  > = {
    Profile: {
      type: 'Profile',
      dedup: true,
      'merge-props': true,
    },
    CustomLabels: {
      type: 'CustomLabels',
      dedup: false,
      'merge-props': false,
    },
    Translations: {
      type: 'Translations',
      dedup: false,
      'merge-props': false,
    },
  };

  /**
   * The default path to the force-app project main default folder.
   *
   * @static
   * @memberof Constants
   */
  public static readonly FORCE_APP_MAIN_DEFAULT_PATH = 'main/default';

  /**
   * The default path to the force-app project main folder.
   *
   * @static
   * @memberof Constants
   */
  public static readonly FORCE_APP_PROJECT_ROOT_MAIN_DEFAULT_PATH =
    'force-app/' + Constants.FORCE_APP_MAIN_DEFAULT_PATH;

  /**
   * The name of the sfdx-project.json file.
   *
   * @static
   * @memberof Constants
   */
  public static readonly FORCE_APP_SFDX_PROJECT_JSON = 'sfdx-project.json';
}
