import { AvailableMetadataTypes, FilenameRegexpReplacement, SftaskerCommandFlags } from './types.js';

/** Constants used throughout the application. */
export class Constants {
  /** The name of the components resource. */
  public static readonly COMPONENTS_RESOURCE_NAME = 'components';

  /** The name of the commands resource. */
  public static readonly COMMANDS_COMMON_RESOURCE_NAME = 'commands';

  /** The path to the temporary directory used for command execution. */
  public static readonly TEMP_PATH = '/tmp';

  /** The default API version used in the application. */
  public static readonly DEFAULT_API_VERSION = '61.0';

  /** The default path to the force-app project manifest file. */
  public static readonly DEFAULT_MANIFEST_PATH = 'manifest/package.xml';

  /** The timeout duration for polling metadata retrieval in milliseconds. */
  public static readonly POLL_TIMEOUT = 300_000;

  /** The default encoding used for reading and writing files. */
  public static readonly DEFAULT_ENCODING = 'utf8';

  /** The default high water mark for read streams. */
  public static readonly DEFAULT_FILE_WRITE_STREAM_HIGH_WATER_MARK = 64 * 1024;

  /** Maps metadata types to their corresponding section keys in the metadata file. */
  public static readonly METADATA_SECTION_KEY_MAPPING = {
    // Profile section key mappings
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

    // Custom labels section key mapping
    CustomLabels: {
      labels: 'fullName',
    },

    // Translations section key mappings
    Translations: {
      flowDefinitions: 'fullName',
      standardValueSetTranslations: 'standardValueSetName',
      '*': 'name',
    },
  };

  /** Maps metadata type names in package.xml to folder names in the force-app project. */
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

  /** Maps metadata type names in package.xml to their corresponding root XML tags in metadata files. */
  public static readonly PACKAGE_XML_METADATA_NAME_TO_XNL_METADATA_FILE_ROOT_TAG_MAPPING: Record<string, string> = {
    Profile: 'Profile',
    CustomLabels: 'CustomLabels',
    Translations: 'Translations',
  };

  /** Maps metadata type names in package.xml to their filename regex patterns and replacements. */
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

  /** Maps metadata type names in package.xml to the flags used in the sftasker command. */
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

  /** The default path to the main default folder in the force-app project. */
  public static readonly FORCE_APP_MAIN_DEFAULT_PATH = 'main/default';

  /** The root path of the force-app project. */
  public static readonly FORCE_APP_PROJECT_ROOT_MAIN_DEFAULT_PATH = 'force-app';

  /** The name of the sfdx-project.json configuration file. */
  public static readonly FORCE_APP_SFDX_PROJECT_JSON = 'sfdx-project.json';

  /** The options to parse CSV files. */
  public static readonly CSV_OPTIONS = {
    columns: true, // First line contains headers
    delimiter: ',', // Specify the delimiter, assuming it's a comma
    quote: '"', // Specify the quote character for fields
    // eslint-disable-next-line camelcase
    relax_quotes: true, // Allow quotes to be escaped
    // eslint-disable-next-line camelcase
    skip_empty_lines: true, // Ignore empty lines in the CSV
    trim: true, // Trim whitespace around fields
    bom: true, // Handle byte order marks if present
  };

  public static readonly BULK_POLLING_INTERVAL = 5000;

  /** Constants used specifically in the data-move command. */
  public static readonly DATA_MOVE_CONSTANTS = {
    /** The default relative path to the configuration file. */
    DEFAULT_CONFIG_PATH: './export.json',
    /** The source directory for temporary CSV files. */
    CSV_SOURCE_SUB_DIRECTORY: 'source',
    /** The target directory for temporary CSV files. */
    CSV_TARGET_SUB_DIRECTORY: 'target',
    /** The temporary directory for processing data. */
    TEMP_DIRECTORY: 'temp',
    /** Separator used for complex external IDs. */
    COMPLEX_EXTERNAL_ID_SEPARATOR: ';',
    /** Separator used for polymorphic fields. */
    POLYMORPHIC_FIELD_SEPARATOR: '$',
    /** SOQL keyword to select all fields. */
    ALL_FIELDS_KEYWORD: 'all',

    /** Fields to exclude from the data move process per object. */
    EXCLUDED_FIELDS: new Map<string, string[]>([
      // Example: ['Account', ['FirstName', 'LastName']], // Excluded fields for business accounts
    ]),

    /** Default external IDs for specific sObject types. */
    DEFAULT_EXTERNAL_ID: new Map<string, string>([
      ['EmailMessage', 'Subject'],
      ['Case', 'CaseNumber'],
      ['Contact', 'Email'],
      ['Lead', 'Email'],
      ['Opportunity', 'Name'],
      ['User', 'Username'],
      ['RecordType', 'DeveloperName;NamespacePrefix;SobjectType'],
    ]),
  };
}
