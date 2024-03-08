import './customize.desktop.css';

const w : any = window;

w.kintone.events.on(['app.record.index.show'],async (ev) => {

    alert('hello kintone!');

    return ev;
});
