import { KintoneRestAPIClient } from '@kintone/rest-api-client';
export function createKintoneClient(profile, opts) {
    const auth = {
        username: profile.username,
        password: profile.password,
    };
    const options = {
        baseUrl: profile.baseUrl,
        auth,
    };
    if (profile.basicUsername) {
        options.basicAuth = {
            username: profile.basicUsername,
            password: profile.basicPassword,
        };
    }
    if (opts?.guestSpaceId) {
        options.guestSpaceId = opts.guestSpaceId;
    }
    return new KintoneRestAPIClient(options);
}
