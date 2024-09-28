import { TestContext } from '@salesforce/core/testSetup';

describe('sftasker merge-meta', () => {
  const $$ = new TestContext();
  //let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    //sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  // it('runs hello', async () => {
  //   await SftaskerMergeMeta.run([
  //     'merge-profile',
  //     '-o',
  //     'DEMO-TARGET',
  //     '-m',
  //     './'
  //   ]);
  //   const output = sfCommandStubs.log
  //     .getCalls()
  //     .flatMap((c) => c.args)
  //     .join('\n');
  //   expect(output).to.includes('extracted successfully');
  // });
});
