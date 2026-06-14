import { KintoneRestAPIClient } from '@kintone/rest-api-client';
import type { Profile } from '../models.js';

export type KintoneClientOptions = {
    guestSpaceId?: string;
};

export function createKintoneClient(profile: Profile, opts?: KintoneClientOptions): KintoneRestAPIClient {
    const auth: Record<string, unknown> = {
        username: profile.username,
        password: profile.password,
    };

    const options: Record<string, unknown> = {
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

    return new KintoneRestAPIClient(options as any);
}
