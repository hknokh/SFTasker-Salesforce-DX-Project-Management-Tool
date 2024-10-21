import fs from 'node:fs';
import path from 'node:path';
import { Connection, Messages } from '@salesforce/core';
import { Constants } from './constants.js';
import { SFtaskerCommand } from './models.js';
import { AvailableMetadataTypes, SftaskerCommandFlags, SftaskerCommandMessages, DataOriginType } from './types.js';

/**
 * Utility class for command-related operations.
 *
 * @typeParam T The type parameter for the SFtaskerCommand.
 */
export class CommandUtils<T> {
  /**
   * Constructs a new CommandUtils instance.
   *
   * @param command The command object for which the utility class is being created.
   */
  public constructor(private command: SFtaskerCommand<T>) {
    // Initialize the CommandUtils with the provided command
  }

  /**
   * Sets up the command messages for the command.
   *
   * @param bundleName The name of the bundle containing the command.
   * @param commandName The name of the command.
   * @returns The command messages object.
   */
  public static setupCommandMessages(bundleName: string, commandName: string): SftaskerCommandMessages {
    // Import the messages directory based on the current module URL
    Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
    const commandIds: string[] = [bundleName, commandName];

    // Load specific messages for the command, commands, and components
    const messages = Messages.loadMessages(commandIds[0], commandIds[1]);
    const commandMessages = Messages.loadMessages(commandIds[0], 'commands');
    const componentsMessages = Messages.loadMessages(commandIds[0], 'components');

    // Combine and return the loaded messages
    return {
      commandMessages: new Messages(
        bundleName,
        commandName,
        new Map([...messages.messages.entries(), ...commandMessages.messages.entries()])
      ),
      componentsMessages,
    };
  }

  /**
   * Sets up the command instance with the provided messages and flags.
   *
   * @param messages The messages object for the command.
   * @param flags The flags object for the command.
   */
  public setupCommandInstance(messages: SftaskerCommandMessages, flags: SftaskerCommandFlags): void {
    const comUtils = new CommandUtils(this.command);

    // Assign the command and components messages
    this.command.messages = messages.commandMessages;
    this.command.componentsMessages = messages.componentsMessages;
    this.command.flags = flags;

    // Log a message indicating the start of the command execution.
    this.logCommandStartMessage();

    // Manage internal flags
    // Assign additional flags based on metadata name to flag mapping
    Object.assign(flags, Constants.PACKAGE_XML_METADATA_NAME_TO_FLAG_MAPPING[flags.type as AvailableMetadataTypes]);

    // Verify connection flags
    switch (this.command.id) {
      case 'sftasker:data-move':
        // Check if the target org connection is provided
        if (!flags['target-org'] && !flags['csv-target']) {
          comUtils.throwCommandError('errors.target-org-or-csv-required');
        }
        // Check if the source org connection is provided
        if (!flags['source-org'] && !flags['csv-source']) {
          this.command.sourceConnectionSameAsTarget = true;
        }
        // Ensure both CSV source and target are not provided simultaneously
        if (flags['csv-source'] && flags['csv-target']) {
          comUtils.throwCommandError('errors.csv-source-and-target');
        }
        break;
      default:
        // Check if the target org connection is provided
        if (!flags['target-org']) {
          this.throwError('errors.target-org-required');
        }
        break;
    }

    // Target Connection
    // Assign the target org connection and org ID to the command object
    this.command.connection = flags['target-org']?.getConnection(flags['api-version'] as string) as Connection;
    this.command.orgId = flags['target-org']?.getOrgId() as string;

    // Set the source connection label from components messages
    this.command.sourceConnectionLabel = this.command.componentsMessages.getMessage('label.source-connection');

    // Source Connection
    // Assign the source org connection and org ID to the command object
    if (!this.command.sourceConnectionSameAsTarget) {
      this.command.sourceConnection = flags['source-org']?.getConnection(flags['api-version'] as string) as Connection;
      this.command.sourceOrgId = flags['source-org']?.getOrgId() as string;
    } else {
      this.command.sourceConnection = this.command.connection;
      this.command.sourceOrgId = this.command.orgId;
    }

    if (this.command.orgId === this.command.sourceOrgId) {
      this.command.sourceConnectionSameAsTarget = true;
    }

    // Set the target connection label from components messages
    this.command.targetConnectionLabel = this.command.componentsMessages.getMessage('label.target-connection');

    // Adjust the data origin type and connections based on the CSV flags
    if (flags['csv-source']) {
      // Use the target connection as the source connection
      this.command.sourceConnection = this.command.connection;
      this.command.sourceOrgId = this.command.orgId;
      // Set the source data origin type to CSV file
      this.command.sourceDataOriginType = DataOriginType.csvfile;
    }

    if (flags['csv-target']) {
      // Use the source connection as the target connection
      this.command.connection = this.command.sourceConnection;
      this.command.orgId = this.command.sourceOrgId;
      // Set the target data origin type to CSV file
      this.command.targetDataOriginType = DataOriginType.csvfile;
    }

    if (this.command.sourceDataOriginType) {
      comUtils.logCommandMessage('command.source-and-target-org-is-same');
    }
  }

  /**
   * Creates a temporary directory for the command execution.
   *
   * @param subdir An optional subdirectory path.
   * @returns The path of the created temporary directory.
   */
  public createTempDirectory(subdir?: string): string {
    // Construct the subdirectories based on the command ID and org ID
    const commandSubdirs = (this.command.id as string).split(':').concat(this.command.orgId);
    const tempPath = path.join(process.cwd(), Constants.TEMP_PATH, ...commandSubdirs, subdir ?? '');

    // Create the directory if it does not exist
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }

    // Return the path to the temporary directory
    return tempPath;
  }

  /**
   * Retrieves the path of the configuration file.
   *
   * @returns The path of the configuration file.
   */
  public getConfigFilePath(): string {
    // Check if the config path is absolute
    if (path.isAbsolute(this.command.flags['config-path'] as string)) {
      return this.command.flags['config-path'] as string;
    }
    // Resolve the config path relative to the current working directory
    return path.join(process.cwd(), this.command.flags['config-path'] as string);
  }

  /**
   * Gets or creates a subdirectory in the configuration directory.
   *
   * @param subdir An optional subdirectory path. If not provided, the configuration directory is returned.
   * @param clearIfExists A flag to clear the directory if it exists. Defaults to false.
   * @returns The path of the created directory.
   */
  public createConfigDirectory(subdir?: string, clearIfExists?: boolean): string | undefined {
    // Get the configuration file path
    const configFilePath = this.getConfigFilePath();
    // Construct the full path to the subdirectory
    const configPath = path.join(path.dirname(configFilePath), subdir ?? '');

    // Create the directory if it does not exist
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath, { recursive: true });
    } else if (clearIfExists) {
      // Clear the directory if it exists and the flag is set
      fs.rmSync(configPath, { recursive: true, force: true });
      fs.mkdirSync(configPath, { recursive: true });
    }

    // Return the path to the configuration directory
    return configPath;
  }

  /**
   * Deletes the temporary directory created for the command execution.
   *
   * @param tempDir The path of the temporary directory to be deleted.
   */
  public deleteTempDirectory(tempDir: string): void {
    try {
      // Check if the temporary directory exists
      if (fs.existsSync(tempDir)) {
        // Remove the directory recursively and forcefully
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Throw a detailed error message if deletion fails
      this.throwWithErrorMessage(error as Error, 'errors.deleting-temp-dir', tempDir);
    }
  }

  /**
   * Throws a component error with a detailed error message, including the stack trace.
   *
   * @param error The error object containing the error message and stack trace.
   * @param messageKey The key for the error message in the components messages.
   * @param messageArgs Additional arguments to be included in the error message.
   * @throws Always throws an error with a custom message.
   */
  public throwWithErrorMessage(error: Error, messageKey: string, ...messageArgs: string[]): never {
    throw this.command.componentsMessages.createError(messageKey, [
      ...messageArgs,
      `\nError message: ${error.message}`,
      `\nStack trace: ${error.stack}`,
    ]);
  }

  /**
   * Throws an unexpected error with a detailed error message, including the stack trace.
   *
   * @param error The error object containing the error message and stack trace.
   * @throws Always throws an error with a custom message.
   */
  public throwUnexpectedError(error: Error): never {
    // Delegate to throwWithErrorMessage with a specific message key
    this.throwWithErrorMessage(error, 'error.unexpected-error', this.command.id as string);
  }

  /**
   * Throws a component error with a message from the components messages.
   *
   * @param messageKey The key for the error message in the components messages.
   * @param messageArgs Additional arguments to be included in the error message.
   * @throws Always throws an error with a custom message.
   */
  public throwError(messageKey: string, ...messageArgs: string[]): never {
    throw new Error(this.command.componentsMessages.getMessage(messageKey, messageArgs));
  }

  /**
   *  Get a component error with a message from the components messages.
   * @param messageKey  The key for the error message in the components messages.
   * @param messageArgs  Additional arguments to be included in the error message.
   * @returns  The error with the custom message.
   */
  public getError(messageKey: string, ...messageArgs: string[]): Error {
    return new Error(this.command.componentsMessages.getMessage(messageKey, messageArgs));
  }

  /**
   * Throws a command error with a message from the command messages.
   *
   * @param messageKey The key for the error message in the command messages.
   * @param messageArgs Additional arguments to be included in the error message.
   * @throws Always throws an error with a custom message.
   */
  public throwCommandError(messageKey: string, ...messageArgs: string[]): never {
    throw new Error(this.command.messages.getMessage(messageKey, messageArgs));
  }

  /**
   *  Get a command error with a message from the command messages.
   * @param messageKey  The key for the error message in the command messages.
   * @param messageArgs  Additional arguments to be included in the error message.
   * @returns  The error with the custom message.
   */
  public getCommandError(messageKey: string, ...messageArgs: string[]): Error {
    return new Error(this.command.messages.getMessage(messageKey, messageArgs));
  }

  /**
   * Logs a component-related message in the command.
   *
   * @param messageKey The key for the message in the components messages.
   * @param messageArgs Additional arguments to be included in the log message.
   */
  public logComponentMessage(messageKey: string, ...messageArgs: string[]): void {
    // Log the component message with a specific prefix
    this.command.log('[COMPONENT INFO] ' + this.command.componentsMessages.getMessage(messageKey, messageArgs));
  }

  /**
   * Logs a command-related message in the command.
   *
   * @param messageKey The key for the message in the command messages.
   * @param messageArgs Additional arguments to be included in the log message.
   */
  public logCommandMessage(messageKey: string, ...messageArgs: string[]): void {
    // Log the command message with a specific prefix
    this.command.log('[COMMAND INFO] ' + this.command.messages.getMessage(messageKey, messageArgs));
  }

  /**
   * Logs a command start message in the command.
   */
  public logCommandStartMessage(): void {
    // Log the start of the command execution
    this.logCommandMessage('command.start', this.command.id as string);
  }

  /**
   * Logs a command end message in the command.
   */
  public logCommandEndMessage(): void {
    // Log the end of the command execution
    this.logCommandMessage('command.end', this.command.id as string);
  }

  /**
   * Starts, updates, or stops a spinner with a message from the components messages.
   *
   * @param mode The mode in which the spinner is used: start, status, or stop. Defaults to 'start'.
   * @param messageKey The key for the message in the components messages.
   * @param messageArgs Additional arguments to be included in the spinner message.
   */
  public spinnerwithComponentMessage(
    mode: 'start' | 'status' | 'stop' = 'start',
    messageKey?: string,
    ...messageArgs: string[]
  ): void {
    switch (mode) {
      case 'start':
        // Start the spinner with a custom message
        this.command.spinner.start(
          '[PROGRESS INFO] ' + this.command.componentsMessages.getMessage(messageKey as string, messageArgs)
        );
        break;
      case 'status':
        // Update the spinner status with a custom message
        this.command.spinner.status =
          '[PROGRESS INFO] ' + this.command.componentsMessages.getMessage(messageKey as string, messageArgs);
        break;
      case 'stop':
        // Stop the spinner with a custom message
        this.command.spinner.stop(
          '\n[PROGRESS INFO] ' + this.command.componentsMessages.getMessage(messageKey as string, messageArgs)
        );
        break;
    }
  }
}
