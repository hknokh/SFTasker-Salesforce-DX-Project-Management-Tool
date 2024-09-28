import { TestSession } from '@salesforce/cli-plugins-testkit';

describe('sftasker merge-meta NUTs', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // it('should display provided name', () => {
  //   const name = 'World';
  //   const command = `sftasker merge-profile --name ${name}`;
  //   const output = execCmd(command, { ensureExitCode: 0 }).shellOutput.stdout;
  //   expect(output).to.contain(name);
  // });
});
