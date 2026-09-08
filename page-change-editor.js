(function (global) {
  function mount(container, manifest) {
    container.replaceChildren();
    const list = document.createElement('div');
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '添加页面变更';
    container.append(list, add);
    add.onclick = () => {
      const row = document.createElement('fieldset');
      row.className = 'page-change-editor';
      const select = document.createElement('select');
      select.setAttribute('aria-label', '涉及页面');
      select.dataset.changeField = 'pageId';
      for (const [id, page] of Object.entries(manifest.pages || {})) select.add(new Option(page.title || id,id));
      select.add(new Option('已移除的页面（手动填写）','__removed__'));
      row.append(select);
      const input = (field,label) => {
        const wrapper = document.createElement('label');
        wrapper.textContent = label;
        const control = ['summary','before','after'].includes(field) ? document.createElement('textarea') : document.createElement('input');
        control.dataset.changeField = field;
        control.setAttribute('aria-label',label);
        wrapper.append(control);
        row.append(wrapper);
        return control;
      };
      const removedId = input('removedId','已移除页面 ID');
      const title = input('title','页面名称');
      const type = document.createElement('select');
      type.dataset.changeField = 'type';
      type.setAttribute('aria-label','变更类型');
      for (const [value,label] of Object.entries(global.ProtoDockPageChanges.types)) type.add(new Option(label,value));
      type.value = 'modify';
      row.append(type);
      input('summary','具体变更'); input('before','修改前'); input('after','修改后');
      const selectPage = () => {
        const removed = select.value === '__removed__';
        removedId.parentElement.hidden = !removed;
        title.value = removed ? '' : manifest.pages[select.value]?.title || select.value;
        if (removed) type.value = 'remove';
      };
      select.onchange = selectPage;
      selectPage();
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '移除此条'; remove.onclick = () => row.remove();
      row.append(remove); list.append(row);
    };
    return () => [...list.children].map(row => {
      const values = Object.fromEntries([...row.querySelectorAll('[data-change-field]')].map(input=>[input.dataset.changeField,input.value.trim()]));
      const {removedId,...change} = values;
      if (change.pageId === '__removed__') {
        change.pageId = removedId;
        if (change.type !== 'remove') throw Error('已移除页面请选择删除类型');
      }
      if (Object.values(change).some(value=>!value)) throw Error('请补全页面变更的所有字段，或移除空白条目');
      return change;
    });
  }
  global.ProtoDockPageChangeEditor = {mount};
})(globalThis);
