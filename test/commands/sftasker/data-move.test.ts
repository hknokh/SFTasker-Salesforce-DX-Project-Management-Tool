import { TestContext } from '@salesforce/core/testSetup';

describe('sftasker data-move', () => {
  const $$ = new TestContext();
  //let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    //   sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  // it('runs hello', async () => {
  //   await SftaskerDataMove.run([]);
  //   const output = sfCommandStubs.log
  //     .getCalls()
  //     .flatMap((c) => c.args)
  //     .join('\n');
  //   expect(output).to.include('hello world');
  // });

  // it('runs hello with --json and no provided name', async () => {
  //   const result = await SftaskerDataMove.run([]);
  //   expect(result.path).to.equal('src/commands/sftasker/data-move.ts');
  // });

  // it('runs hello world --name Astro', async () => {
  //   await SftaskerDataMove.run(['--name', 'Astro']);
  //   const output = sfCommandStubs.log
  //     .getCalls()
  //     .flatMap((c) => c.args)
  //     .join('\n');
  //   expect(output).to.include('hello Astro');
  // });
});
