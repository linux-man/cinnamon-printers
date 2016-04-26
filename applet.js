const Applet = imports.ui.applet;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;
const Gettext = imports.gettext;

Gettext.bindtextdomain('printers@linux-man', GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
   let resultConf = Gettext.dgettext('printers@linux-man', str);
   if(resultConf != str) {
      return resultConf;
   }
   return Gettext.gettext(str);
};

function MyApplet(metadata, orientation, panel_height, instance_id) {
  this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
  __proto__: Applet.TextIconApplet.prototype,

  _init: function(orientation, panel_height, instance_id) {
    Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

    this.set_applet_tooltip(_("Printers"));

    this.menuManager = new PopupMenu.PopupMenuManager(this);
    this.menu = new Applet.AppletPopupMenu(this, orientation);
    this.menuManager.addMenu(this.menu);

    this.settings = new Settings.AppletSettings(this, "printers@linux-man", instance_id);

    this.settings.bindProperty(Settings.BindingDirection.IN, "always-show-icon", "always_show_icon", this.on_settings_changed, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "show-error", "show_error", this.on_settings_changed, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "show-jobs", "show_jobs", this.on_settings_changed, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "job-number", "job_number", this.on_settings_changed, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "send-to-front", "send_to_front", this.on_settings_changed, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "symbolic-icons", "symbolic_icons", this.on_settings_changed, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "interval", "interval", this.on_settings_changed, null);

    this.jobCount = 0;
    this.printError = false;
    this.printers = [];
    this.on_settings_changed();
    this.update();
  },

  on_show_printers_clicked: function() {
    Util.spawn(['system-config-printer']);
  },

  on_show_jobs_clicked: function(item) {
    Util.spawn(['system-config-printer', '--show-jobs', item.label.text]);
  },

  on_cancel_all_jobs_clicked: function() {
    for(var n = 0; n < this.printers.length - 1; n++) {
      Util.spawn(['cancel', '-a', this.printers[n]]);
    }
  },

  on_cancel_job_clicked: function(item) {
    Util.spawn(['cancel', item.job]);
  },

  on_send_to_front_clicked: function(item) {
    Util.spawn(['lp', '-i', item.job, '-q 100']);
  },

  show_warning_icon: function () {
    if (this.symbolic_icons) this.set_applet_icon_symbolic_name("printer-warning");
    else this.set_applet_icon_name("printer-warning");
    Mainloop.timeout_add_seconds(3, Lang.bind(this, this.update_icon));
  },

  update_icon: function() {
    if(this.show_error && this.printError) {
      if (this.symbolic_icons) this.set_applet_icon_symbolic_name("printer-error");
      else this.set_applet_icon_name("printer-error");
    }
    else {
      if (this.symbolic_icons) this.set_applet_icon_symbolic_name("printer-printing");
      else this.set_applet_icon_name("printer-printing");
    }
  },

  update: function() {
    var [res, out] = GLib.spawn_sync(null, ['/usr/bin/lpstat', '-l'], null, 0, null);
    out = bin2string(out);
    this.printError = out.indexOf("Unable") >= 0 || out.indexOf(" not ") >= 0;
    [res, out] = GLib.spawn_sync(null, ['/usr/bin/lpstat', '-o'], null, 0, null);
    out = bin2string(out).split(/\n/);
    this.update_icon();
    if(this.jobCount != out.length - 1) this.show_warning_icon();
    this.jobCount = out.length - 1
    if(this.jobCount > 0 && this.show_jobs) this.set_applet_label(this.jobCount.toString());
    else this.set_applet_label("");
    this._applet_icon_box.visible = this.always_show_icon || this.jobCount > 0;
    Mainloop.timeout_add_seconds(this.interval, Lang.bind(this, this.update));
  },

  on_settings_changed: function() {
    if (this.symbolic_icons) this.icontype = St.IconType.SYMBOLIC;
    else this.icontype = St.IconType.FULLCOLOR;
    this.printError = false;
    this.update_icon();
  },

  on_applet_clicked: function(event) {
    if(!this.menu.isOpen) {
      this.menu.removeAll();
      let printers = new PopupMenu.PopupIconMenuItem(_("Printers"), "printer-printing", this.icontype);
      printers.connect('activate', Lang.bind(this, this.on_show_printers_clicked));
      this.menu.addMenuItem(printers);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem);
//Add Printers
      var [res, out] = GLib.spawn_sync(null, ['/usr/bin/lpstat', '-a'], null, 0, null);
      out = bin2string(out);
      this.printers = [];
      if(out.length > 0) {
        var [res2, out2] = GLib.spawn_sync(null, ['/usr/bin/lpstat', '-d'], null, 0, null);//To check default printer
        out2 = bin2string(out2);
        out = out.split("\n");
        for(var n = 0; n < out.length - 1; n++) {
          let printer = out[n].split(" ")[0];
          this.printers.push(printer);
          let printerItem = new PopupMenu.PopupIconMenuItem(printer, "emblem-documents", this.icontype);
          if(out2.indexOf(printer) >= 0) printerItem.addActor(new St.Icon({ style_class: 'popup-menu-icon',icon_name: 'emblem-default', icon_type: this.icontype }));
          printerItem.connect('activate', Lang.bind(printerItem, this.on_show_jobs_clicked));
          this.menu.addMenuItem(printerItem);
        }
      }
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem);
//Add Jobs
      [res, out] = GLib.spawn_sync(null, ['/usr/bin/lpstat', '-o'], null, 0, null);
      out = bin2string(out);
      if(out.length > 0) {//If there are jobs
//Cancel all item
        let cancelItem = new PopupMenu.PopupIconMenuItem(_("Cancel all jobs"), "edit-delete", this.icontype);
        cancelItem.connect('activate', Lang.bind(this, this.on_cancel_all_jobs_clicked));
        this.menu.addMenuItem(cancelItem);
//Cancel job
        out = out.split(/\n/);
        var [res2, out2] = GLib.spawn_sync(null, ['/usr/bin/lpq', '-a'], null, 0, null);//To get document name
        out2 = bin2string(out2).replace(/\n/g, " ").split(/\s+/);
        let sendJobs = [];
        for(var n = 0; n < out.length - 1; n++) {
          let line = out[n].split(" ")[0].split("-");
          let job = line.slice(-1)[0];
          let printer = line.slice(0, -1).join("-");
          let doc = out2[out2.indexOf(job) + 1];
          for(var m = out2.indexOf(job) + 2; m < out2.length; m++) {
            if(isNaN(out2[m])) doc = doc + " " + out2[m];
            else break;
          }
          if(doc.length > 30) doc = doc + "...";
          let text = doc;
          if(this.job_number) text += " (" + job + ")";
          text += " " + _("at") + " " + printer;
          let jobItem = new PopupMenu.PopupIconMenuItem(text, "edit-delete", this.icontype);
          if(out2[out2.indexOf(job) - 2] == "active") jobItem.addActor(new St.Icon({ style_class: 'popup-menu-icon',icon_name: 'emblem-default', icon_type: this.icontype }));
          jobItem.job = job;
          jobItem.connect('activate', Lang.bind(jobItem, this.on_cancel_job_clicked));
          this.menu.addMenuItem(jobItem);
          if(this.send_to_front && out2[out2.indexOf(job) - 2] != "active" && out2[out2.indexOf(job) - 2] != "1st") {
            sendJobs.push(new PopupMenu.PopupIconMenuItem(text, "go-up", this.icontype));
            sendJobs[sendJobs.length - 1].job = job;
            sendJobs[sendJobs.length - 1].connect('activate', Lang.bind(sendJobs[sendJobs.length - 1], this.on_send_to_front_clicked));
          }
        }
        if(this.send_to_front && sendJobs.length > 0) {
          let subMenu = new PopupMenu.PopupSubMenuMenuItem(_("Send to front"));
          for(var n = 0; n < sendJobs.length; n++) {
            subMenu.menu.addMenuItem(sendJobs[n]);
          }
          this.menu.addMenuItem(subMenu);
        }
      }
    }
    this.menu.toggle();
  },

  on_applet_removed_from_panel: function() {
    this.settings.finalize();
  }
};

function main(metadata, orientation, panel_height, instance_id) {
  let myApplet = new MyApplet(metadata, orientation, panel_height, instance_id);
  return myApplet;
}

function bin2string(array){
  var result = "";
  for(var i = 0; i < array.length; ++i){
    result+= (String.fromCharCode(array[i]));
  }
  return result;
}
