import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";

actor {
  include MixinStorage();

  type MediaType = {
    #text;
    #image;
    #link;
    #video;
    #youtube;
    #twitch;
    #twitter;
  };

  type Category = {
    id : Nat;
    name : Text;
  };

  type Post = {
    id : Nat;
    threadId : Nat;
    authorDisplayId : Text;
    content : Text;
    mediaUrl : ?Storage.ExternalBlob;
    mediaType : MediaType;
    createdAt : Int;
    isDeleted : Bool;
  };

  type Thread = {
    id : Nat;
    title : Text;
    categoryId : Nat;
    creatorDisplayId : Text;
    createdAt : Int;
    lastActivity : Int;
    isArchived : Bool;
    isClosed : Bool;
    postCount : Nat;
  };

  public type Ban = {
    displayId : Text;
    reason : Text;
    timestamp : Int;
  };

  type Presence = {
    threadId : Nat;
    timestamp : Int;
  };
};
