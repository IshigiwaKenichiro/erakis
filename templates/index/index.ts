import app from '../apps.json';
import server from '../server.json';

////////////////////////////////////////////////////////////////
//// src/models.ts
////////////////////////////////////////////////////////////////

export type Server = {
    port: number;
    https?: {
        cert: string;
        key: string;
    }
}

export type Customization = {
    appName: string;
    development: App
    production: App
}

export type App = {
    profileName: string;
    appId: string;
    guestSpaceId: string;
    baseUrl : string;
    status: 'local' | 'fixed' | 'released'
}

export type Profile = {
    name: string;
    baseUrl: string;
    username: string;
    password: string;
    basicUsername: string;
    basicPassword: string;
}

export type AppData = {
    customizations: {
        [appName: string]: Customization;
    }
}

////////////////////////////////////////////////////////////////
//// src/models.ts
///////////////////////////////////////////////////////////////

function application2url(application: App) {

    if (_.isEmpty(application.guestSpaceId)) {
        return `${application.baseUrl}/k/${application.appId}`
    } else {
        return `${application.baseUrl}/k/guest/${application.guestSpaceId}/${application.appId}`
    }
}
const $$root = document.getElementById('erakis-root');

const tTable = `
<table>
    <thead>
        <th>application_name</th>
        <th>development</th>
        <th>dev_state</th>
        <th>production</th>
        <th>prod_state</th>
    </thead>
    <tbody>
        ${Object.values((app as AppData).customizations).map((custom) => {
            const row = {
                application_name : custom.appName,
                development : application2url(custom.development),
                dev_state : custom.development.status,
                production : application2url(custom.production),
                prod_state : custom.production.status,
            }

            return `
                <tr>
                    <td>${row.application_name}</td>
                    <td>
                        <a href="${row.development}" target="_blank">
                            ${row.development}
                        </a>
                    </td>
                    <td>${row.dev_state}</td>
                    <td>
                        <a href="${row.production}" target="_blank">
                            ${row.production}
                        </a>
                    </td>
                    <td>${row.prod_state}</td>
                </tr>
            `
        }).join('\n')}
    </tbody>
</table>
👉<a href="/src/test/index.html">test</a>
`
const $$divTab = document.createElement("div");
$$root?.appendChild($$divTab);
$$divTab.innerHTML = tTable;





