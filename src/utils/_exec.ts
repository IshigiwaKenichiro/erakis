
import cp from 'child_process';

export function exec(com : string) {
    console.log(com);
    cp.execSync(com, { stdio: 'inherit' });
}
