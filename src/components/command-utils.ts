import fs from 'node:fs';
import path from 'node:path';
import { Connection, Messages } from '@salesforce/core';
import { Constants } from './constants.js';
import { SFtaskerCommand } from './models.js';
import { AvailableMetadataTypes, SftaskerCommandFlags, SftaskerCommandMessages } from './types.js';

/**
 * Utility class for command-related operations.
 */
export class CommandUtils<T> {
  /**
   * Creates a new instance of the CommandUtils class.
   * @param command  The command object for which the utility class is being created
   * @returns  A new instance of the CommandUtils class
   * @template T - The type used in the SFtaskerCommand.
   */
  public constructor(private command: SFtaskerCommand<T>) {}

  /**
   * Sets up the command messages for the command.
   * @param bundleName  The name of the bundle containing the command
   * @param commandName  The name of the command
   * @returns The command messages object
   */
  public static setupCommandMessages(bundleName: string, commandName: string): SftaskerCommandMessages {
    Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
    const commandIds: string[] = [bundleName, commandName];

    const messages = Messages.loadMessages(commandIds[0], commandIds[1]);
    const commandMessages = Messages.loadMessages(commandIds[0], 'commands');
    const componentsMessages = Messages.loadMessages(commandIds[0], 'components');

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
   *  Sets up the command instance with the messages, components messages, and flags.
   * @template T - The type used in the SFtaskerCommand.
   * @param command  The command object to be set up
   * @param messages  The messages object for the command
   * @param componentsMessages  The messages object for the components used in the command
   * @param flags  The flags object for the command
   */
  public setupCommandInstance(messages: SftaskerCommandMessages, flags: SftaskerCommandFlags): void {
    this.command.messages = messages.commandMessages;
    this.command.componentsMessages = messages.componentsMessages;
    this.command.flags = flags;
    // Internally manage some of the flags
    if (flags) {
      Object.assign(flags, Constants.PACKAGE_XML_METADATA_NAME_TO_FLAG_MAPPING[flags.type as AvailableMetadataTypes]);
      this.command.connection = flags['target-org']?.getConnection(flags['api-version'] as string) as Connection;
      this.command.orgId = flags['target-org']?.getOrgId() as string;
    }
  }

  /**
   * Creates a temporary directory for the command execution.
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object for which the directory is being created.
   * @param {string} [subdir] - An optional subdirectory path.
   * @returns {string} - The path of the created temporary directory.
   */
  public createTempDirectory(subdir?: string): string {
    const commandSubdirs = (this.command.id as string).split(':').concat(this.command.orgId);
    const tempPath = path.join(process.cwd(), Constants.TEMP_PATH, ...commandSubdirs, subdir ?? '');
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    return tempPath;
  }

  /**
   *  Gets the path of the configuration file.
   * @param command  The command object for which the configuration file path is being retrieved
   * @returns  The path of the configuration file
   */
  public getConfigFilePath(): string {
    if (path.isAbsolute(this.command.flags['config-path'] as string)) {
      return this.command.flags['config-path'] as string;
    }
    return path.join(process.cwd(), this.command.flags['config-path'] as string);
  }

  /**
   *  Gets or creates a subdirectory in the configuration directory.
   * @template T - The type used in the SFtaskerCommand.
   * @param command  The command object for which the directory is being created
   * @param subdir  An optional subdirectory path. if not provided, the configuration directory is returned.
   * @returns  The path of the created directory
   */
  public createConfigDirectory(subdir?: string): string | undefined {
    const configFilePath = this.getConfigFilePath();
    const configPath = path.join(path.dirname(configFilePath), subdir ?? '');
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configPath, { recursive: true });
    }
    return configPath;
  }

  /**
   *  Deletes the temporary directory created for the command execution.
   * @template T - The type used in the SFtaskerCommand.
   * @param command  The command object for which the directory is being deleted
   * @param tempDir  The path of the temporary directory to be deleted
   */
  public deleteTempDirectory(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      this.throwWithErrorMessage(error as Error, 'errors.deleting-temp-dir', tempDir);
    }
  }

  /**
   * Throws a component error with a detailed error message, including the stack trace.
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object where the error is thrown.
   * @param {Error} error - The error object containing the error message and stack trace.
   * @param {string} messageKey - The key for the error message in the components messages.
   * @param {string[]} messageArgs - Additional arguments to be included in the error message.
   * @throws Will throw an error with a custom message.
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
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object where the error is thrown.
   * @param {Error} error - The error object containing the error message and stack trace.
   * @throws Will throw an error with a custom message.
   */
  public throwUnexpectedError(error: Error): never {
    this.throwWithErrorMessage(error, 'error.unexpected-error', this.command.id as string);
  }

  /**
   * Throws a component error with a message from the components messages.
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object where the error is thrown.
   * @param {string} messageKey - The key for the error message in the components messages.
   * @param {string[]} messageArgs - Additional arguments to be included in the error message.
   * @throws Will throw an error with a custom
   */
  public throwError(messageKey: string, ...messageArgs: string[]): never {
    throw new Error(this.command.componentsMessages.getMessage(messageKey, messageArgs));
  }

  /**
   * Throws a command error with a message from the components messages.
   * @template T - The type used in the SFtaskerCommand.*
   * @param {SFtaskerCommand<T>} command - The command object where the error is thrown.
   * @param {string} messageKey - The key for the error message in the components messages.
   * @param {string[]} messageArgs -  Additional arguments to be included in the error message.
   */
  public throwCommandError(messageKey: string, ...messageArgs: string[]): never {
    throw new Error(this.command.messages.getMessage(messageKey, messageArgs));
  }

  /**
   * Logs a component-related message in the command.
   * @template T - The type used in the SFtaskerCommand.
   * @param {SFtaskerCommand<T>} command - The command object in which the message is logged.
   * @param {string} messageKey - The key for the message in the components messages.
   * @param {string[]} messageArgs - Additional arguments to be included in the log message.
   */
  public logComponentMessage(messageKey: string, ...messageArgs: string[]): void {
    this.command.log('[PROGRESS INFO] ' + this.command.componentsMessages.getMessage(messageKey, messageArgs));
  }

  /**
   *  Logs a command-related message in the command.
   * @template T - The type used in the SFtaskerCommand.
   * @param command  The command object in which the message is logged
   * @param messageKey  The key for the message in the command messages
   * @param messageArgs  Additional arguments to be included in the log message
   */
  public logCommandMessage(messageKey: string, ...messageArgs: string[]): void {
    this.command.log('[COMMAND INFO] ' + this.command.messages.getMessage(messageKey, messageArgs));
  }

  /**
   *  Logs a command start message in the command.
   * @template T - The type used in the SFtaskerCommand.
   * @param command  The command object in which the message is logged
   */
  public logCommandStartMessage(): void {
    this.logCommandMessage('command.start', this.command.id as string);
  }

  /**
   *  Logs a command end message in the command.
   * @template T - The type used in the SFtaskerCommand.
   * @param command  The command object in which the message is logged
   */
  public logCommandEndMessage(): void {
    this.logCommandMessage('command.end', this.command.id as string);
  }

  /**
   *  Start spinner, update status, or stop spinner with a message from the components messages.
   * @template T - The type used in the SFtaskerCommand.
   * @param command  The command object where the spinner is started, updated, or stopped
   * @param mode  The mode in which the spinner is used: start, status, or stop
   * @param messageKey  The key for the message in the components messages
   * @param messageArgs  Additional arguments to be included in the spinner message
   */
  public spinnerwithComponentMessage(
    mode: 'start' | 'status' | 'stop' = 'start',
    messageKey?: string,
    ...messageArgs: string[]
  ): void {
    switch (mode) {
      case 'start':
        this.command.spinner.start(
          '[PROGRESS INFO] ' + this.command.componentsMessages.getMessage(messageKey as string, messageArgs)
        );
        break;
      case 'status':
        // eslint-disable-next-line no-param-reassign
        this.command.spinner.status =
          '[PROGRESS INFO] ' + this.command.componentsMessages.getMessage(messageKey as string, messageArgs);
        break;
      case 'stop':
        this.command.spinner.stop(
          '\n[PROGRESS INFO] ' + this.command.componentsMessages.getMessage(messageKey as string, messageArgs)
        );
        break;
    }
  }
}
